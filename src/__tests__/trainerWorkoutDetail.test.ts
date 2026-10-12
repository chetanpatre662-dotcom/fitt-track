import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

/**
 * FEAT-002 §3: the single-workout detail endpoint
 * GET /api/trainer/students/:studentUid/workouts/:workoutId.
 *
 * Mirrors the full-stack in-memory-Firestore pattern of trainerRoutes.test.ts:
 * the real trainer router + auth/role middleware + error handler are exercised
 * end-to-end, with a Bearer token mapped to a uid and an in-memory Firestore
 * backing role resolution, trainerLinks ownership, and the student's workout
 * doc. Asserts ownership 404, the sharing gate, the full per-set projection
 * (incl. cardio fields), empty-sets and non-completed handling, stored
 * aggregates returned as-is, AND the route-ordering regression guard
 * (/workouts/history still returns the aggregate list after the :workoutId
 * route is registered).
 */

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;

/** Bearer token -> uid. */
const TOKENS: Record<string, string> = {
  'trainer-token': 'trainer-1',
  'student-token': 'student-1',
};

function makeDocRef(path: string) {
  return {
    id: path.split('/').pop(),
    collection: (sub: string) => makeCollectionRef(`${path}/${sub}`),
    get: async () => ({
      exists: docs.has(path),
      id: path.split('/').pop(),
      data: () => docs.get(path),
    }),
    set: async (data: Doc, options?: { merge?: boolean }) => {
      const prev = options?.merge ? docs.get(path) ?? {} : {};
      docs.set(path, { ...prev, ...data });
    },
  };
}

function makeCollectionRef(base: string) {
  const entriesIn = () =>
    [...docs.entries()].filter(([p]) => {
      const rest = p.startsWith(`${base}/`) ? p.slice(base.length + 1) : null;
      return rest !== null && !rest.includes('/');
    });
  const query = (preds: Array<[string, unknown]>) => ({
    where: (f: string, _o: string, v: unknown) => query([...preds, [f, v]]),
    orderBy: (_f: string, _dir?: string) => query(preds),
    limit: (_n: number) => query(preds),
    get: async () => {
      const m = entriesIn().filter(([, d]) => preds.every(([f, v]) => d[f] === v));
      return { size: m.length, docs: m.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
    },
  });
  return {
    doc: (id?: string) => makeDocRef(`${base}/${id ?? `auto-${docs.size}`}`),
    where: (f: string, _o: string, v: unknown) => query([[f, v]]),
    orderBy: (_f: string, _dir?: string) => makeCollectionRef(base),
    get: async () => {
      const m = entriesIn();
      return { size: m.length, docs: m.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
    },
  };
}

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => ({
    collection: (name: string) => makeCollectionRef(name),
  }),
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      const uid = TOKENS[token];
      if (!uid) throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
      return { uid };
    },
  }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({}) },
    },
  },
}));

import trainerRoutes from '../routes/trainer.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api/trainer', trainerRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

function auth(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A fake Firestore Timestamp exposing the toDate the service reads. */
function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

type DetailBody = {
  data: {
    shared: boolean;
    workout: {
      id: string;
      name: string;
      status: string;
      type: string | null;
      startedAt: string | null;
      durationSeconds?: number;
      totalVolume?: number;
      completedSets?: number;
      totalReps?: number;
      exercises: Array<{
        exerciseId: string;
        name: string | null;
        order: number;
        notes: string | null;
        sets: Array<{
          setNumber: number;
          weightKg: number | null;
          reps: number | null;
          distanceM: number | null;
          durationSeconds: number | null;
          calories: number | null;
          completed: boolean;
        }>;
      }>;
    } | null;
  };
};

beforeEach(() => {
  docs = new Map();
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('users/student-1', { role: 'student' });
  // trainer-1 owns owned-stu; trainer-2 owns other-stu.
  docs.set('trainerLinks/owned-stu', { trainerId: 'trainer-1', status: 'active' });
  docs.set('trainerLinks/other-stu', { trainerId: 'trainer-2', status: 'active' });
  // Default profile: sharing workoutHistory ON.
  docs.set('users/owned-stu/profile/data', {
    name: 'Owned',
    trainerSharing: { workoutHistory: true },
  });
  // A completed strength + cardio workout with full per-set data.
  docs.set('users/owned-stu/workouts/w1', {
    name: 'Push Day',
    type: 'strength',
    status: 'completed',
    startedAt: ts('2024-03-01T10:00:00.000Z'),
    endedAt: ts('2024-03-01T11:00:00.000Z'),
    durationSeconds: 3600,
    totalVolume: 5000,
    completedSets: 3,
    totalReps: 20,
    muscleGroups: ['chest'],
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Barbell Bench Press',
        order: 0,
        notes: 'felt strong',
        sets: [
          { setNumber: 1, completed: true, weightKg: 90, reps: 5 },
          { setNumber: 2, completed: false, weightKg: 100, reps: 3 },
        ],
      },
      {
        // cardio: distance/duration/calories present, no weight/reps.
        exerciseId: 'treadmill',
        name: 'Treadmill Run',
        order: 1,
        sets: [
          { setNumber: 1, completed: true, distanceM: 2000, durationSeconds: 600, calories: 150 },
        ],
      },
    ],
  });
});

describe('GET /api/trainer/students/:studentUid/workouts/:workoutId', () => {
  it('non-owner trainer -> 404 (ownership before any read)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/workouts/w1`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });

  it('non-trainer -> 403', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/w1`, {
        headers: auth('student-token'),
      });
      expect(res.status).toBe(403);
    } finally {
      close();
    }
  });

  it('sharing OFF -> 200 with workout:null (gate parity with history)', async () => {
    docs.set('users/owned-stu/profile/data', {
      name: 'Owned',
      trainerSharing: { workoutHistory: false },
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/w1`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as DetailBody;
      expect(body.data.shared).toBe(false);
      expect(body.data.workout).toBeNull();
    } finally {
      close();
    }
  });

  it('missing doc -> 200 with workout:null (anti-enumeration parity)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/does-not-exist`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as DetailBody;
      expect(body.data.shared).toBe(true);
      expect(body.data.workout).toBeNull();
    } finally {
      close();
    }
  });

  it('projects every recorded set incl. cardio fields, with stored aggregates as-is', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/w1`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as DetailBody;
      expect(body.data.shared).toBe(true);
      const w = body.data.workout!;
      expect(w.id).toBe('w1');
      expect(w.name).toBe('Push Day');
      expect(w.type).toBe('strength');
      expect(w.status).toBe('completed');
      expect(w.startedAt).toBe('2024-03-01T10:00:00.000Z');

      // Stored session aggregates returned AS STORED (not recomputed from sets).
      expect(w.totalVolume).toBe(5000);
      expect(w.completedSets).toBe(3);
      expect(w.totalReps).toBe(20);
      expect(w.durationSeconds).toBe(3600);

      // Strength exercise: both sets returned, completed flags preserved.
      const bench = w.exercises[0];
      expect(bench.exerciseId).toBe('bench');
      expect(bench.name).toBe('Barbell Bench Press');
      expect(bench.notes).toBe('felt strong');
      expect(bench.sets).toHaveLength(2);
      expect(bench.sets[0]).toMatchObject({
        setNumber: 1,
        weightKg: 90,
        reps: 5,
        completed: true,
        distanceM: null,
        durationSeconds: null,
        calories: null,
      });
      expect(bench.sets[1]).toMatchObject({ setNumber: 2, completed: false, weightKg: 100, reps: 3 });

      // Cardio exercise: distance/duration/calories passed through; weight/reps null.
      const cardio = w.exercises[1];
      expect(cardio.exerciseId).toBe('treadmill');
      expect(cardio.sets[0]).toMatchObject({
        distanceM: 2000,
        durationSeconds: 600,
        calories: 150,
        weightKg: null,
        reps: null,
        completed: true,
      });
    } finally {
      close();
    }
  });

  it('empty sets[] and a non-completed session are returned truthfully', async () => {
    docs.set('users/owned-stu/workouts/w2', {
      name: 'In Progress Leg Day',
      status: 'in_progress',
      startedAt: ts('2024-03-02T09:00:00.000Z'),
      // No stored aggregates on this partial session -> omitted in the projection.
      exercises: [
        { exerciseId: 'squat', name: 'Back Squat', order: 0, sets: [] },
      ],
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/w2`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as DetailBody;
      const w = body.data.workout!;
      expect(w.status).toBe('in_progress');
      expect(w.exercises[0].sets).toEqual([]);
      // Absent stored aggregates are omitted (UI shows '—'), never fabricated.
      expect(w.totalVolume).toBeUndefined();
      expect(w.completedSets).toBeUndefined();
      expect(w.durationSeconds).toBeUndefined();
    } finally {
      close();
    }
  });

  it('route ordering: /workouts/history STILL returns the aggregate list after the :workoutId route exists', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/history`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { shared: boolean; history: Array<{ id: string; totalVolume: number }> };
      };
      // The literal history route won over the :workoutId param route: we get
      // the aggregate list, NOT a single-workout detail envelope.
      expect(body.data.shared).toBe(true);
      expect(Array.isArray(body.data.history)).toBe(true);
      expect(body.data.history).toHaveLength(1);
      expect(body.data.history[0].id).toBe('w1');
      expect(body.data.history[0].totalVolume).toBe(5000);
    } finally {
      close();
    }
  });
});
