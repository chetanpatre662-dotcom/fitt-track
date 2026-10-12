import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * FEAT-004 §8/§4 — the server stays AUTHORITATIVE on sharing.
 *
 * Asserts, against the in-memory Firestore mock, that:
 *   1. studentService.setSharing persists the granular map and a subsequent
 *      read (resolveSharing via getTrainer) reflects it exactly;
 *   2. a category toggled OFF returns empty / shared:false from EVERY
 *      trainer-facing loader that gates on it — a hidden category cannot leak
 *      through another endpoint or a direct service call;
 *   3. the FEAT-002 workout-detail endpoint applies the SAME workoutHistory
 *      gate (so a hidden history cannot leak a single workout);
 *   4. flipping the category back ON re-enables the gated reads (the server map
 *      is the single source of truth, never a one-way fake success).
 *
 * The mock models the collection chain the paginated history query uses
 * (where/orderBy/startAfter/limit as ordering-preserving passthroughs) plus a
 * startedAt Timestamp exposing toDate, matching the real stored shape.
 */

const SERVER_TS = { __fv: 'serverTimestamp' };

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;

function makeDocRef(path: string) {
  return {
    id: path.split('/').pop() as string,
    collection: (sub: string) => makeCollectionRef(`${path}/${sub}`),
    get: async () => ({
      exists: docs.has(path),
      id: path.split('/').pop() as string,
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
  // orderBy/startAfter/limit are passthroughs (ordering/paging is asserted by
  // the service's defensive in-memory sort, not the mock).
  const query = (preds: Array<[string, unknown]>) => ({
    where: (f: string, _o: string, v: unknown) => query([...preds, [f, v]]),
    orderBy: (_f: string, _dir?: string) => query(preds),
    startAfter: (..._args: unknown[]) => query(preds),
    limit: (_n: number) => query(preds),
    get: async () => {
      const m = entriesIn().filter(([, d]) => preds.every(([f, v]) => d[f] === v));
      return { size: m.length, docs: m.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
    },
  });
  return {
    doc: (id?: string) => makeDocRef(`${base}/${id ?? `auto-${docs.size}`}`),
    where: (f: string, _o: string, v: unknown) => query([[f, v]]),
    orderBy: (_f: string, _dir?: string) => query([]),
    get: async () => {
      const m = entriesIn();
      return { size: m.length, docs: m.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
    },
  };
}

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => ({ collection: (name: string) => makeCollectionRef(name) }),
  getBucket: () => ({
    file: () => ({
      getSignedUrl: async () => ['https://signed.example/x'],
      delete: async () => undefined,
    }),
  }),
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SERVER_TS,
        increment: (n: number) => ({ __fv: 'increment', n }),
      },
    },
  },
}));

import { trainerService } from '../services/trainerService.js';
import { studentService } from '../services/studentService.js';

const STU = 'stu-share';

/** A fake Firestore Timestamp exposing the toDate the service reads. */
function ts(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

beforeEach(() => {
  docs = new Map();
  docs.set('trainers/trainer-1', {
    trainerId: 'trainer-1',
    name: 'Alex Carter',
    referralCode: 'FITCHE123',
    status: 'active',
    active: true,
  });
  docs.set('trainerLinks/' + STU, { trainerId: 'trainer-1', status: 'active' });
  // A completed workout so the history/detail reads have real data to gate.
  docs.set(`users/${STU}/workouts/w1`, {
    name: 'Push Day',
    status: 'completed',
    startedAt: ts('2024-03-01T10:00:00.000Z'),
    durationSeconds: 3600,
    totalVolume: 5000,
    completedSets: 3,
    totalReps: 20,
    muscleGroups: ['chest'],
    exercises: [{ exerciseId: 'bench', name: 'Bench', order: 0, sets: [{ setNumber: 1, completed: true, weightKg: 90, reps: 5 }] }],
  });
});

describe('setSharing persists the granular map and reads reflect it', () => {
  it('a one-key patch persists and resolveSharing echoes the full five-key map', async () => {
    const result = await studentService.setSharing(STU, { workoutHistory: true });
    expect(result).toMatchObject({ workoutHistory: true, nutrition: false });

    // The stored map persisted.
    const profile = docs.get(`users/${STU}/profile/data`) as Record<string, unknown>;
    expect((profile.trainerSharing as Record<string, unknown>).workoutHistory).toBe(true);

    // A subsequent read reflects it (getTrainer resolves the same map).
    const card = await studentService.getTrainer(STU);
    expect(card.trainer?.sharing).toMatchObject({ workoutHistory: true, nutrition: false });
  });
});

describe('a toggled-off category returns empty from EVERY trainer-facing endpoint', () => {
  beforeEach(async () => {
    // Share everything first, then we toggle categories OFF per assertion.
    await studentService.setSharing(STU, {
      workoutHistory: true,
      nutrition: true,
      measurements: true,
      progressPhotos: true,
      progressReports: true,
    });
  });

  it('workoutHistory OFF hides today, history AND the single-workout detail', async () => {
    // Sanity: ON -> every workout-gated read is shared.
    expect((await trainerService.studentWorkoutsForDate(STU, '2024-03-01')).shared).toBe(true);
    expect((await trainerService.studentWorkoutHistory(STU)).shared).toBe(true);
    expect((await trainerService.studentWorkoutDetail(STU, 'w1')).shared).toBe(true);

    await studentService.setSharing(STU, { workoutHistory: false });

    const today = await trainerService.studentWorkoutsForDate(STU, '2024-03-01');
    expect(today.shared).toBe(false);
    expect(today.workouts).toEqual([]);

    const history = await trainerService.studentWorkoutHistory(STU);
    expect(history.shared).toBe(false);
    expect(history.history).toEqual([]);
    expect(history.nextCursor).toBeNull();

    // The FEAT-002 detail endpoint applies the SAME gate: no single workout
    // leaks even though the doc exists.
    const detail = await trainerService.studentWorkoutDetail(STU, 'w1');
    expect(detail.shared).toBe(false);
    expect(detail.workout).toBeNull();
  });

  it('nutrition OFF hides both the nutrition and the water endpoint', async () => {
    await studentService.setSharing(STU, { nutrition: false });
    expect((await trainerService.studentNutrition(STU, '2024-03-01')).shared).toBe(false);
    expect((await trainerService.studentWater(STU, '2024-03-01')).shared).toBe(false);
  });

  it('measurements OFF hides the measurements endpoint', async () => {
    await studentService.setSharing(STU, { measurements: false });
    expect((await trainerService.studentMeasurements(STU)).shared).toBe(false);
  });

  it('progressReports OFF hides progress, records and exercise progression', async () => {
    await studentService.setSharing(STU, { progressReports: false });
    expect((await trainerService.studentProgress(STU)).shared).toBe(false);
    expect((await trainerService.studentRecords(STU)).shared).toBe(false);
    expect((await trainerService.studentExerciseProgression(STU, 'bench')).shared).toBe(false);
  });

  it('progressPhotos OFF hides the photos endpoint', async () => {
    await studentService.setSharing(STU, { progressPhotos: false });
    expect((await trainerService.studentPhotos(STU)).shared).toBe(false);
  });
});

describe('the server map is authoritative both ways (no permanent fake success)', () => {
  it('turning a category back ON re-enables its gated reads', async () => {
    await studentService.setSharing(STU, { workoutHistory: true });
    expect((await trainerService.studentWorkoutHistory(STU)).shared).toBe(true);

    await studentService.setSharing(STU, { workoutHistory: false });
    expect((await trainerService.studentWorkoutHistory(STU)).shared).toBe(false);

    await studentService.setSharing(STU, { workoutHistory: true });
    const back = await trainerService.studentWorkoutHistory(STU);
    expect(back.shared).toBe(true);
    expect(back.history).toHaveLength(1);
    expect(back.history[0]).toMatchObject({ id: 'w1', totalVolume: 5000 });
  });
});
