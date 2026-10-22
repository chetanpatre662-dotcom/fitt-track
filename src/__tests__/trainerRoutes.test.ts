import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

/**
 * Route-level authorization matrix for /api/trainer/*. We mock the Firebase
 * config so token verification maps a Bearer token to a uid, and an in-memory
 * Firestore backs role resolution + trainerLinks ownership. The real trainer
 * router, auth + role middleware, and error handler are exercised end-to-end.
 */

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;
/** Bearer token -> uid. */
const TOKENS: Record<string, string> = {
  'trainer-token': 'trainer-1',
  'student-token': 'student-1',
  'user-token': 'user-1',
  'newuser-token': 'newuser-1',
  'student2-token': 'student-2',
};

function applyFieldValues(prev: Doc, patch: Doc): Doc {
  const out: Doc = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && (v as { __fv?: string }).__fv === 'increment') {
      const cur = typeof out[k] === 'number' ? (out[k] as number) : 0;
      out[k] = cur + (v as { n: number }).n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function makeDocRef(path: string) {
  return {
    id: path.split('/').pop(),
    collection: (sub: string) => makeCollectionRef(`${path}/${sub}`),
    get: async () => ({ exists: docs.has(path), id: path.split('/').pop(), data: () => docs.get(path) }),
    set: async (data: Doc, options?: { merge?: boolean }) => {
      const prev = options?.merge ? docs.get(path) ?? {} : {};
      docs.set(path, applyFieldValues(prev, data));
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
    // orderBy/limit chain after where() in the repositories; no-op passthroughs.
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
    // orderBy is a no-op passthrough for the in-memory mock (ordering is not
    // asserted at the route level); the service/repository still sorts rows.
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
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> }, data: Doc, opts?: { merge?: boolean }) => {
          void ref.set(data, opts);
        },
      };
      return fn(tx);
    },
  }),
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      const uid = TOKENS[token];
      if (!uid) throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
      return { uid };
    },
  }),
  getBucket: () => ({
    file: () => ({
      getSignedUrl: async () => ['https://signed.example/x'],
      delete: async () => undefined,
    }),
  }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({}), increment: (n: number) => ({ __fv: 'increment', n }) },
      // A minimal Timestamp whose fromDate() yields an object exposing the
      // toDate()/toMillis() the measurement service + repository read back.
      Timestamp: {
        fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
      },
    },
  },
}));

import trainerRoutes from '../routes/trainer.routes.js';
import authRoutes from '../routes/auth.routes.js';
import studentRoutes from '../routes/student.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api/trainer', trainerRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

function auth(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

beforeEach(() => {
  docs = new Map();
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('trainers/trainer-1', {
    trainerId: 'trainer-1',
    name: 'Alex Carter',
    referralCode: 'FITCHE123',
    referralCodeLower: 'fitche123',
    status: 'active',
    active: true,
    totalStudents: 1,
  });
  docs.set('referralCodes/fitche123', { trainerId: 'trainer-1', code: 'FITCHE123', active: true });
  docs.set('users/student-1', { role: 'student' });
  docs.set('users/student-2', { role: 'student' });
  docs.set('users/user-1', { role: 'user' });
  // trainer-1 owns owned-stu; trainer-2 owns other-stu.
  docs.set('trainerLinks/owned-stu', { trainerId: 'trainer-1', status: 'active' });
  docs.set('users/owned-stu/profile/data', { name: 'Owned', goals: ['gain_muscle'] });
  docs.set('trainerLinks/other-stu', { trainerId: 'trainer-2', status: 'active' });
});

describe('/api/trainer authorization matrix', () => {
  it('401 when unauthenticated', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/profile`);
      expect(res.status).toBe(401);
    } finally {
      close();
    }
  });

  it('403 when a student token hits a trainer route', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students`, { headers: auth('student-token') });
      expect(res.status).toBe(403);
    } finally {
      close();
    }
  });

  it('403 when a normal user token hits a trainer route', async () => {
    // Defense in depth: a `user` role (not just `student`) must be rejected by
    // requireTrainer. The server resolves the role from Firestore, never the
    // client, so a tampered client cannot reach trainer-only data.
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students`, { headers: auth('user-token') });
      expect(res.status).toBe(403);
      const profile = await fetch(`${url}/api/trainer/profile`, { headers: auth('user-token') });
      expect(profile.status).toBe(403);
    } finally {
      close();
    }
  });

  it('200 for a trainer reading their profile (live student count)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/profile`, { headers: auth('trainer-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { profile: { totalStudents: number } } };
      // owned-stu is the only active link for trainer-1.
      expect(body.data.profile.totalStudents).toBe(1);
    } finally {
      close();
    }
  });

  it('200 for an owned student overview', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/overview`, { headers: auth('trainer-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { overview: { studentUid: string } } };
      expect(body.data.overview.studentUid).toBe('owned-stu');
    } finally {
      close();
    }
  });

  it("404 for another trainer's student", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/overview`, { headers: auth('trainer-token') });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });

  it('404 for a non-existent student', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/ghost/overview`, { headers: auth('trainer-token') });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });
});

describe('/api/trainer/students/:uid/overview body-metric gate (measurements)', () => {
  /** owned-stu is active with trainer-1 (seeded by the top-level beforeEach). */
  function seedBodyProfile(measurements: boolean): void {
    docs.set('users/owned-stu/profile/data', {
      name: 'Owned',
      photoUrl: 'http://img/owned',
      goals: ['gain_muscle'],
      activityLevel: 'high',
      weightKg: 82,
      heightCm: 180,
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      ageYears: 35,
      gender: 'male',
      targets: { calories: 2800, protein: 180 },
      units: 'metric',
      fitnessLevel: 'advanced',
      trainerSharing: { measurements },
    });
  }

  async function overviewProfile(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${url}/api/trainer/students/owned-stu/overview`, {
      headers: auth('trainer-token'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { overview: { profile: Record<string, unknown>; measurementsShared: boolean } };
    };
    return body.data.overview as unknown as Record<string, unknown>;
  }

  it('measurements OFF -> body metrics + targets NOT in the JSON (direct API read blocked)', async () => {
    seedBodyProfile(false);
    const { url, close } = serve();
    try {
      const overview = await overviewProfile(url);
      expect(overview.measurementsShared).toBe(false);
      const profile = overview.profile as Record<string, unknown>;
      expect(profile).not.toHaveProperty('weightKg');
      expect(profile).not.toHaveProperty('heightCm');
      expect(profile).not.toHaveProperty('dateOfBirth');
      expect(profile).not.toHaveProperty('gender');
      expect(profile).not.toHaveProperty('targets');
      // Never leak the private sharing map / non-allowlisted keys over the wire.
      expect(profile).not.toHaveProperty('trainerSharing');
      expect(profile).not.toHaveProperty('units');
      // Coaching identity is still present.
      expect(profile).toMatchObject({ name: 'Owned', photoUrl: 'http://img/owned' });
    } finally {
      close();
    }
  });

  it('measurements ON -> body metrics + targets ARE in the JSON', async () => {
    seedBodyProfile(true);
    const { url, close } = serve();
    try {
      const overview = await overviewProfile(url);
      expect(overview.measurementsShared).toBe(true);
      const profile = overview.profile as Record<string, unknown>;
      expect(profile).toMatchObject({ weightKg: 82, heightCm: 180, gender: 'male' });
      expect(profile).toHaveProperty('targets');
    } finally {
      close();
    }
  });

  it('turning measurements back ON restores the fields', async () => {
    seedBodyProfile(false);
    const { url, close } = serve();
    try {
      let profile = (await overviewProfile(url)).profile as Record<string, unknown>;
      expect(profile).not.toHaveProperty('weightKg');

      seedBodyProfile(true);
      profile = (await overviewProfile(url)).profile as Record<string, unknown>;
      expect(profile).toMatchObject({ weightKg: 82 });
      expect(profile).toHaveProperty('targets');
    } finally {
      close();
    }
  });

  it("a non-owning trainer still gets 404 (ownership before the gate)", async () => {
    seedBodyProfile(true);
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/overview`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });
});

describe('/api/trainer/referral-code endpoints', () => {
  it('401 unauth / 403 student / 200 trainer on GET', async () => {
    const { url, close } = serve();
    try {
      expect((await fetch(`${url}/api/trainer/referral-code`)).status).toBe(401);
      expect(
        (await fetch(`${url}/api/trainer/referral-code`, { headers: auth('student-token') })).status,
      ).toBe(403);
      const res = await fetch(`${url}/api/trainer/referral-code`, { headers: auth('trainer-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { referralCode: { code: string } } };
      expect(body.data.referralCode.code).toBe('FITCHE123');
    } finally {
      close();
    }
  });

  it('POST generates a new code that replaces the old one', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/referral-code`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { referralCode: { code: string } } };
      const newCode = body.data.referralCode.code;
      expect(newCode).not.toBe('FITCHE123');
      // Trainer record updated; old index doc deactivated.
      expect(docs.get('trainers/trainer-1')?.referralCode).toBe(newCode);
      expect(docs.get('referralCodes/fitche123')?.active).toBe(false);
      expect(docs.get(`referralCodes/${newCode.toLowerCase()}`)).toMatchObject({ active: true });
    } finally {
      close();
    }
  });

  it('PATCH sets a custom code (200) and rejects a taken one (409)', async () => {
    docs.set('users/trainer-2', { role: 'trainer' });
    docs.set('trainers/trainer-2', { trainerId: 'trainer-2', status: 'active' });
    docs.set('referralCodes/takenone', { trainerId: 'trainer-2', code: 'TakenOne', active: true });
    const { url, close } = serve();
    try {
      const okRes = await fetch(`${url}/api/trainer/referral-code`, {
        method: 'PATCH',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'MyCoolCode' }),
      });
      expect(okRes.status).toBe(200);
      expect(docs.get('trainers/trainer-1')?.referralCode).toBe('MyCoolCode');

      const conflict = await fetch(`${url}/api/trainer/referral-code`, {
        method: 'PATCH',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'TakenOne' }),
      });
      expect(conflict.status).toBe(409);
    } finally {
      close();
    }
  });

  it('availability returns {available, reason}', async () => {
    const { url, close } = serve();
    try {
      const avail = await fetch(`${url}/api/trainer/referral-code/availability?code=FreshCode`, {
        headers: auth('trainer-token'),
      });
      expect(avail.status).toBe(200);
      expect(((await avail.json()) as { data: { available: boolean } }).data.available).toBe(true);

      const taken = await fetch(`${url}/api/trainer/referral-code/availability?code=FITCHE123`, {
        headers: auth('student-token'),
      });
      // Student cannot reach a trainer route.
      expect(taken.status).toBe(403);
    } finally {
      close();
    }
  });
});

describe('/api/auth/register-trainer', () => {
  it('401 without a token', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/auth/register-trainer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Coach Zoe' }),
      });
      expect(res.status).toBe(401);
    } finally {
      close();
    }
  });

  it('200 promotes a new user to trainer and is idempotent', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/auth/register-trainer`, {
        method: 'POST',
        headers: { ...auth('newuser-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Coach Zoe' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { trainerId: string; referralCode: string } };
      expect(body.data.trainerId).toBe('newuser-1');
      expect(body.data.referralCode).toBeTruthy();
      expect(docs.get('users/newuser-1')?.role).toBe('trainer');
      const firstCode = body.data.referralCode;

      // Re-call: no duplicate trainer, same code.
      const again = await fetch(`${url}/api/auth/register-trainer`, {
        method: 'POST',
        headers: { ...auth('newuser-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Coach Zoe' }),
      });
      const againBody = (await again.json()) as { data: { referralCode: string } };
      expect(againBody.data.referralCode).toBe(firstCode);
    } finally {
      close();
    }
  });
});

describe('/api/student/connect-trainer (pending request flow)', () => {
  it('valid code creates a PENDING request (no active link, no mirror)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/connect-trainer`, {
        method: 'POST',
        headers: { ...auth('student-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ referralCode: 'FITCHE123' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { ok: boolean; status: string; trainerId: string } };
      expect(body.data.ok).toBe(true);
      expect(body.data.status).toBe('pending');
      expect(body.data.trainerId).toBe('trainer-1');
      expect(docs.get('trainerLinks/student-1')).toMatchObject({
        trainerId: 'trainer-1',
        status: 'pending',
      });
      // No profile mirror until approval.
      expect(docs.has('users/student-1/profile/data')).toBe(false);
    } finally {
      close();
    }
  });

  it('invalid code returns a soft failure', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/connect-trainer`, {
        method: 'POST',
        headers: { ...auth('student-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ referralCode: 'nope' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { ok: boolean; reason: string } };
      expect(body.data).toEqual({ ok: false, reason: 'invalid_code' });
    } finally {
      close();
    }
  });

  it('already ACTIVE with a different trainer -> already_linked, no overwrite', async () => {
    docs.set('users/trainer-2', { role: 'trainer' });
    docs.set('trainers/trainer-2', {
      trainerId: 'trainer-2',
      name: 'Bela Rao',
      status: 'active',
      active: true,
    });
    docs.set('referralCodes/gymrahul45', { trainerId: 'trainer-2', code: 'GYMRAHUL45', active: true });
    // student-2 is already linked (active) to trainer-1.
    docs.set('trainerLinks/student-2', { trainerId: 'trainer-1', status: 'active' });

    const { url, close } = serve();
    try {
      const conflict = await fetch(`${url}/api/student/connect-trainer`, {
        method: 'POST',
        headers: { ...auth('student2-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ referralCode: 'GYMRAHUL45' }),
      });
      const conflictBody = (await conflict.json()) as { data: { ok: boolean; reason: string } };
      expect(conflictBody.data.ok).toBe(false);
      expect(conflictBody.data.reason).toBe('already_linked');
      // The active link is untouched.
      expect(docs.get('trainerLinks/student-2')).toMatchObject({
        trainerId: 'trainer-1',
        status: 'active',
      });
    } finally {
      close();
    }
  });
});

describe('/api/trainer/requests (approve/reject inbox)', () => {
  beforeEach(() => {
    // A pending request from student-1 to trainer-1.
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'pending' });
    docs.set('users/student-1/profile/data', { name: 'Sam', photoUrl: 'http://img/sam' });
    // A pending request owned by a different trainer (must stay invisible).
    docs.set('trainerLinks/other-pending', { trainerId: 'trainer-2', status: 'pending' });
  });

  it('403 for a student, 200 + only own pending for a trainer', async () => {
    const { url, close } = serve();
    try {
      expect(
        (await fetch(`${url}/api/trainer/requests`, { headers: auth('student-token') })).status,
      ).toBe(403);

      const res = await fetch(`${url}/api/trainer/requests`, { headers: auth('trainer-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { requests: Array<{ studentUid: string; name: string; photoUrl: string }> };
      };
      expect(body.data.requests).toHaveLength(1);
      expect(body.data.requests[0]).toMatchObject({
        studentUid: 'student-1',
        name: 'Sam',
        photoUrl: 'http://img/sam',
      });
    } finally {
      close();
    }
  });

  it('approve sets active, mirrors profile + trainerStatus, counts +1', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/student-1/approve`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { ok: boolean; status: string; studentUid: string } };
      expect(body.data).toMatchObject({ ok: true, status: 'active', studentUid: 'student-1' });
      expect(docs.get('trainerLinks/student-1')).toMatchObject({ status: 'active', trainerId: 'trainer-1' });
      expect(docs.get('users/student-1/profile/data')).toMatchObject({
        trainerId: 'trainer-1',
        trainerStatus: 'approved',
      });
      expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(2); // seeded 1 + approval
    } finally {
      close();
    }
  });

  it('reject sets rejected, no mirror, no count change', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/student-1/reject`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { ok: boolean; status: string } };
      expect(body.data).toMatchObject({ ok: true, status: 'rejected' });
      expect(docs.get('trainerLinks/student-1')).toMatchObject({ status: 'rejected' });
      expect(docs.get('users/student-1/profile/data')?.trainerId).toBeUndefined();
      expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
    } finally {
      close();
    }
  });

  it("404 approving another trainer's pending request", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/other-pending/approve`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });

  it('404 approving/rejecting a non-pending (already active) link', async () => {
    docs.set('trainerLinks/owned-stu', { trainerId: 'trainer-1', status: 'active' });
    const { url, close } = serve();
    try {
      const approve = await fetch(`${url}/api/trainer/requests/owned-stu/approve`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(approve.status).toBe(404);
      const reject = await fetch(`${url}/api/trainer/requests/owned-stu/reject`, {
        method: 'POST',
        headers: auth('trainer-token'),
      });
      expect(reject.status).toBe(404);
    } finally {
      close();
    }
  });

  it('a pending (not-yet-approved) link grants NO per-student data access (404)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/student-1/overview`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });
});

describe('/api/trainer per-student data endpoints (measurements/exercise/records)', () => {
  /** A fake Firestore Timestamp exposing the toDate used by the services. */
  function ts(iso: string): { toDate: () => Date } {
    return { toDate: () => new Date(iso) };
  }

  beforeEach(() => {
    // owned-stu is active with trainer-1 (seeded by the top-level beforeEach).
    // Enable every granular sharing category so these non-authz data assertions
    // read real data (per-category gating is covered by the sharing matrix).
    docs.set('users/owned-stu/profile/data', {
      name: 'Owned',
      goals: ['gain_muscle'],
      trainerSharing: {
        workoutHistory: true,
        nutrition: true,
        measurements: true,
        progressPhotos: true,
        progressReports: true,
      },
    });
    // Seed the student's real data so the owning trainer gets non-empty reads.
    docs.set('users/owned-stu/bodyMeasurements/m1', {
      type: 'body',
      measuredAt: '2024-01-01T00:00:00.000Z',
      heightCm: 180,
      weightKg: 82,
      note: null,
    });
    docs.set('users/owned-stu/bodyMeasurements/m2', {
      type: 'body',
      measuredAt: '2024-02-01T00:00:00.000Z',
      heightCm: 180,
      weightKg: 80,
      note: 'cut',
    });
    docs.set('users/owned-stu/personalRecords/bench__max_weight', {
      exerciseId: 'bench',
      recordType: 'max_weight',
      value: 100,
      reps: 1,
      weightKg: 100,
    });
    // A completed workout containing the 'bench' exercise for progression.
    docs.set('users/owned-stu/workouts/w1', {
      name: 'Push Day',
      status: 'completed',
      startedAt: ts('2024-03-01T10:00:00.000Z'),
      durationSeconds: 3600,
      totalVolume: 5000,
      completedSets: 10,
      totalReps: 50,
      muscleGroups: ['chest'],
      exercises: [
        {
          exerciseId: 'bench',
          sets: [
            { completed: true, weightKg: 90, reps: 5 },
            { completed: true, weightKg: 100, reps: 3 },
          ],
        },
      ],
    });
  });

  // --- measurements ---------------------------------------------------------
  describe('GET /students/:studentUid/measurements', () => {
    it('200 for the owning trainer with the student real data', async () => {
      const { url, close } = serve();
      try {
        const res = await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
          headers: auth('trainer-token'),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          success: boolean;
          data: { measurements: Array<{ weightKg: number; measuredAt: string }> };
        };
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.measurements)).toBe(true);
        expect(body.data.measurements).toHaveLength(2);
        // Newest first (2024-02 before 2024-01).
        expect(body.data.measurements[0].weightKg).toBe(80);
      } finally {
        close();
      }
    });

    it('401 unauthenticated', async () => {
      const { url, close } = serve();
      try {
        expect((await fetch(`${url}/api/trainer/students/owned-stu/measurements`)).status).toBe(401);
      } finally {
        close();
      }
    });

    it('403 for a student and a user role', async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/measurements`, { headers: auth('student-token') })).status,
        ).toBe(403);
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/measurements`, { headers: auth('user-token') })).status,
        ).toBe(403);
      } finally {
        close();
      }
    });

    it("404 for another trainer's student, a non-existent student, and pending/rejected links", async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/other-stu/measurements`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
        expect(
          (await fetch(`${url}/api/trainer/students/ghost/measurements`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/pending-stu', { trainerId: 'trainer-1', status: 'pending' });
        expect(
          (await fetch(`${url}/api/trainer/students/pending-stu/measurements`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/rejected-stu', { trainerId: 'trainer-1', status: 'rejected' });
        expect(
          (await fetch(`${url}/api/trainer/students/rejected-stu/measurements`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
      } finally {
        close();
      }
    });
  });

  // --- exercise progression -------------------------------------------------
  describe('GET /students/:studentUid/exercise', () => {
    it('200 threads the exerciseId through and returns progression points', async () => {
      const { url, close } = serve();
      try {
        const res = await fetch(
          `${url}/api/trainer/students/owned-stu/exercise?exerciseId=bench&range=all`,
          { headers: auth('trainer-token') },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          success: boolean;
          data: {
            progression: {
              exerciseId: string;
              range: string;
              points: Array<{ date: string; maxWeightKg: number; maxReps: number }>;
            };
          };
        };
        expect(body.success).toBe(true);
        expect(body.data.progression.exerciseId).toBe('bench');
        expect(body.data.progression.range).toBe('all');
        expect(body.data.progression.points).toHaveLength(1);
        expect(body.data.progression.points[0].maxWeightKg).toBe(100);
        // §3 fix: maxReps is the reps performed on the MAX-WEIGHT set (100kg×3),
        // not the max reps of any set (the 90kg×5 warm-up). The 100kg/3 pair
        // actually co-occurred; 100kg/5 never happened.
        expect(body.data.progression.points[0].maxReps).toBe(3);
      } finally {
        close();
      }
    });

    it('422 when exerciseId is missing (validator)', async () => {
      const { url, close } = serve();
      try {
        const res = await fetch(`${url}/api/trainer/students/owned-stu/exercise`, {
          headers: auth('trainer-token'),
        });
        expect(res.status).toBe(422);
      } finally {
        close();
      }
    });

    it('401 unauthenticated', async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/exercise?exerciseId=bench`)).status,
        ).toBe(401);
      } finally {
        close();
      }
    });

    it('403 for a student and a user role', async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/exercise?exerciseId=bench`, { headers: auth('student-token') })).status,
        ).toBe(403);
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/exercise?exerciseId=bench`, { headers: auth('user-token') })).status,
        ).toBe(403);
      } finally {
        close();
      }
    });

    it("404 for another trainer's / non-existent / pending / rejected student", async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/other-stu/exercise?exerciseId=bench`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
        expect(
          (await fetch(`${url}/api/trainer/students/ghost/exercise?exerciseId=bench`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/pending-stu', { trainerId: 'trainer-1', status: 'pending' });
        expect(
          (await fetch(`${url}/api/trainer/students/pending-stu/exercise?exerciseId=bench`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/rejected-stu', { trainerId: 'trainer-1', status: 'rejected' });
        expect(
          (await fetch(`${url}/api/trainer/students/rejected-stu/exercise?exerciseId=bench`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
      } finally {
        close();
      }
    });
  });

  // --- personal records -----------------------------------------------------
  describe('GET /students/:studentUid/records', () => {
    it('200 for the owning trainer returns the student personal records', async () => {
      const { url, close } = serve();
      try {
        const res = await fetch(`${url}/api/trainer/students/owned-stu/records`, {
          headers: auth('trainer-token'),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          success: boolean;
          data: { personalRecords: Array<{ exerciseId: string; recordType: string; value: number }> };
        };
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.personalRecords)).toBe(true);
        expect(body.data.personalRecords).toHaveLength(1);
        expect(body.data.personalRecords[0]).toMatchObject({
          exerciseId: 'bench',
          recordType: 'max_weight',
          value: 100,
        });
      } finally {
        close();
      }
    });

    it('401 unauthenticated', async () => {
      const { url, close } = serve();
      try {
        expect((await fetch(`${url}/api/trainer/students/owned-stu/records`)).status).toBe(401);
      } finally {
        close();
      }
    });

    it('403 for a student and a user role', async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/records`, { headers: auth('student-token') })).status,
        ).toBe(403);
        expect(
          (await fetch(`${url}/api/trainer/students/owned-stu/records`, { headers: auth('user-token') })).status,
        ).toBe(403);
      } finally {
        close();
      }
    });

    it("404 for another trainer's / non-existent / pending / rejected student", async () => {
      const { url, close } = serve();
      try {
        expect(
          (await fetch(`${url}/api/trainer/students/other-stu/records`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
        expect(
          (await fetch(`${url}/api/trainer/students/ghost/records`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/pending-stu', { trainerId: 'trainer-1', status: 'pending' });
        expect(
          (await fetch(`${url}/api/trainer/students/pending-stu/records`, { headers: auth('trainer-token') })).status,
        ).toBe(404);

        docs.set('trainerLinks/rejected-stu', { trainerId: 'trainer-1', status: 'rejected' });
        expect(
          (await fetch(`${url}/api/trainer/students/rejected-stu/records`, { headers: auth('trainer-token') })).status,
        ).toBe(404);
      } finally {
        close();
      }
    });
  });
});

// --- FEAT-004: trainer writes a student body-measurement -------------------
//
// POST /students/:studentUid/measurements is an additive, authorized write that
// reuses measurementCreateSchema + measurementService.add. Asserts the
// requireTrainer + assertTrainerOwnsStudent gate, body validation, and that the
// record lands under users/{studentUid}/bodyMeasurements with type:'body'.
describe('/api/trainer POST /students/:studentUid/measurements (FEAT-004)', () => {
  const VALID = { heightCm: 180, weightKg: 81, note: 'trainer check-in' };

  it('owner writes a measurement (200) under users/{studentUid}/bodyMeasurements with type:body', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify(VALID),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        data: { measurement: { id: string; type: string; heightCm: number; weightKg: number } };
      };
      expect(body.success).toBe(true);
      expect(body.data.measurement.type).toBe('body');
      expect(body.data.measurement.heightCm).toBe(180);
      expect(body.data.measurement.weightKg).toBe(81);
      // The write landed under the STUDENT's subcollection (never the trainer's).
      const written = [...docs.entries()].find(
        ([p]) => p.startsWith('users/owned-stu/bodyMeasurements/'),
      );
      expect(written).toBeTruthy();
      expect(written?.[1]).toMatchObject({ type: 'body', heightCm: 180, weightKg: 81 });
      expect(docs.has(`users/trainer-1/bodyMeasurements/${body.data.measurement.id}`)).toBe(false);
    } finally {
      close();
    }
  });

  it('401 unauthenticated / 403 for a student / 403 for a user role', async () => {
    const { url, close } = serve();
    try {
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
            method: 'POST',
            headers: { ...auth('student-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
            method: 'POST',
            headers: { ...auth('user-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(403);
    } finally {
      close();
    }
  });

  it("404 for another trainer's / non-existent / pending / rejected student (no write)", async () => {
    const { url, close } = serve();
    try {
      expect(
        (
          await fetch(`${url}/api/trainer/students/other-stu/measurements`, {
            method: 'POST',
            headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(404);
      expect(
        [...docs.keys()].some((p) => p.startsWith('users/other-stu/bodyMeasurements/')),
      ).toBe(false);

      expect(
        (
          await fetch(`${url}/api/trainer/students/ghost/measurements`, {
            method: 'POST',
            headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(404);

      docs.set('trainerLinks/pending-stu', { trainerId: 'trainer-1', status: 'pending' });
      expect(
        (
          await fetch(`${url}/api/trainer/students/pending-stu/measurements`, {
            method: 'POST',
            headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(404);

      docs.set('trainerLinks/rejected-stu', { trainerId: 'trainer-1', status: 'rejected' });
      expect(
        (
          await fetch(`${url}/api/trainer/students/rejected-stu/measurements`, {
            method: 'POST',
            headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
            body: JSON.stringify(VALID),
          })
        ).status,
      ).toBe(404);
    } finally {
      close();
    }
  });

  it('422 for an out-of-range height/weight (measurementCreateSchema)', async () => {
    const { url, close } = serve();
    try {
      const tooTall = await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ heightCm: 999, weightKg: 80 }),
      });
      expect(tooTall.status).toBe(422);
      const tooLight = await fetch(`${url}/api/trainer/students/owned-stu/measurements`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ heightCm: 180, weightKg: 1 }),
      });
      expect(tooLight.status).toBe(422);
      // No partial write from a rejected body.
      expect(
        [...docs.keys()].some((p) => p.startsWith('users/owned-stu/bodyMeasurements/')),
      ).toBe(false);
    } finally {
      close();
    }
  });
});

// --- FEAT-001: per-category sharing gate authorization matrix ---------------
//
// For every gated category we assert the full matrix on a representative
// endpoint:
//   owner + sharing ON  -> 200 { shared:true, <data> }
//   owner + sharing OFF -> 200 { shared:false, <empty> }  (ownership passed)
//   non-owner           -> 404 (ownership 404 fires BEFORE the sharing gate)
//   non-trainer         -> 403 (requireTrainer fires first)
// A legacy-boolean student (no granular map) is also checked: it shares ONLY
// progress photos, so a workout-history read stays {shared:false}.
describe('/api/trainer per-student sharing gate (FEAT-001)', () => {
  type Row = { field?: string } & Record<string, unknown>;

  /** path, response key to read, and the sharing category that gates it. */
  const CASES: Array<{ name: string; path: string; key: string; category: string }> = [
    { name: 'workouts (today)', path: 'workouts', key: 'workouts', category: 'workoutHistory' },
    { name: 'workout history', path: 'workouts/history', key: 'history', category: 'workoutHistory' },
    { name: 'nutrition', path: 'nutrition', key: 'entries', category: 'nutrition' },
    { name: 'water', path: 'water', key: 'entries', category: 'nutrition' },
    { name: 'measurements', path: 'measurements', key: 'measurements', category: 'measurements' },
    { name: 'photos', path: 'photos', key: 'photos', category: 'progressPhotos' },
    { name: 'progress', path: 'progress', key: 'progress', category: 'progressReports' },
    { name: 'records', path: 'records', key: 'personalRecords', category: 'progressReports' },
    {
      name: 'exercise progression',
      path: 'exercise?exerciseId=bench&range=all',
      key: 'progression',
      category: 'progressReports',
    },
  ];

  function setSharing(uid: string, category: string, value: boolean): void {
    const prev = (docs.get(`users/${uid}/profile/data`) as Record<string, unknown>) ?? {};
    const map = (prev.trainerSharing as Record<string, unknown>) ?? {};
    docs.set(`users/${uid}/profile/data`, {
      ...prev,
      trainerSharing: { ...map, [category]: value },
    });
  }

  for (const c of CASES) {
    describe(c.name, () => {
      it('owner + sharing ON -> 200 shared:true', async () => {
        setSharing('owned-stu', c.category, true);
        const { url, close } = serve();
        try {
          const res = await fetch(`${url}/api/trainer/students/owned-stu/${c.path}`, {
            headers: auth('trainer-token'),
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { data: Row };
          expect(body.data.shared).toBe(true);
        } finally {
          close();
        }
      });

      it('owner + sharing OFF -> 200 shared:false (ownership passed first)', async () => {
        setSharing('owned-stu', c.category, false);
        const { url, close } = serve();
        try {
          const res = await fetch(`${url}/api/trainer/students/owned-stu/${c.path}`, {
            headers: auth('trainer-token'),
          });
          expect(res.status).toBe(200);
          const body = (await res.json()) as { data: Row };
          expect(body.data.shared).toBe(false);
        } finally {
          close();
        }
      });

      it('non-owner -> 404 (before the sharing gate)', async () => {
        // other-stu belongs to trainer-2; sharing it ON must not change the 404.
        setSharing('other-stu', c.category, true);
        const { url, close } = serve();
        try {
          const res = await fetch(`${url}/api/trainer/students/other-stu/${c.path}`, {
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
          const res = await fetch(`${url}/api/trainer/students/owned-stu/${c.path}`, {
            headers: auth('student-token'),
          });
          expect(res.status).toBe(403);
        } finally {
          close();
        }
      });
    });
  }

  it('legacy boolean (shareProgressWithTrainer=true) shares ONLY photos', async () => {
    docs.set('users/owned-stu/profile/data', { name: 'Owned', shareProgressWithTrainer: true });
    const { url, close } = serve();
    try {
      const photos = await fetch(`${url}/api/trainer/students/owned-stu/photos`, {
        headers: auth('trainer-token'),
      });
      expect(((await photos.json()) as { data: { shared: boolean } }).data.shared).toBe(true);

      const history = await fetch(`${url}/api/trainer/students/owned-stu/workouts/history`, {
        headers: auth('trainer-token'),
      });
      expect(((await history.json()) as { data: { shared: boolean } }).data.shared).toBe(false);

      const nutrition = await fetch(`${url}/api/trainer/students/owned-stu/nutrition`, {
        headers: auth('trainer-token'),
      });
      expect(((await nutrition.json()) as { data: { shared: boolean } }).data.shared).toBe(false);
    } finally {
      close();
    }
  });
});

// --- FEAT-002: trainer-assigned diet plans ----------------------------------
//
// Covers the assign (trainer) + fetch (student) authz matrix:
//   assign owner       -> 200, plan stored at dietPlans/{studentUid}
//   assign non-owner   -> 404 (ownership before any write)
//   assign non-trainer -> 403 (requireTrainer first)
//   empty body         -> 422 (schema validator)
//   bad storage path   -> 400 (service path-ownership guard: wrong prefix / '..')
//   student GET        -> only own ACTIVE-trainer plan; stale/other-trainer -> null
describe('/api/trainer diet-plan assign (FEAT-002)', () => {
  it('owner assigns a text plan (200) and stores dietPlans/{studentUid}', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Chicken, rice, broccoli x3' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: { text: string; imageUrl: string | null } } };
      expect(body.data.dietPlan.text).toBe('Chicken, rice, broccoli x3');
      expect(body.data.dietPlan.imageUrl).toBeNull();
      expect(docs.get('dietPlans/owned-stu')).toMatchObject({
        trainerId: 'trainer-1',
        studentUid: 'owned-stu',
        text: 'Chicken, rice, broccoli x3',
      });
    } finally {
      close();
    }
  });

  it('owner assigns an image plan under their own prefix (200, signed imageUrl)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({
          imageStoragePath: 'users/trainer-1/dietPlans/owned-stu/123.jpg',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: { imageUrl: string | null } } };
      expect(body.data.dietPlan.imageUrl).toBe('https://signed.example/x');
    } finally {
      close();
    }
  });

  it("404 assigning to another trainer's student (before any write)", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'nope' }),
      });
      expect(res.status).toBe(404);
      expect(docs.has('dietPlans/other-stu')).toBe(false);
    } finally {
      close();
    }
  });

  it('403 for a student / user role', async () => {
    const { url, close } = serve();
    try {
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
            method: 'POST',
            headers: { ...auth('student-token'), 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'x' }),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
            method: 'POST',
            headers: { ...auth('user-token'), 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'x' }),
          })
        ).status,
      ).toBe(403);
    } finally {
      close();
    }
  });

  it('422 on an empty body (schema requires text or image)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(422);
    } finally {
      close();
    }
  });

  it('400 for a storage path with the wrong prefix', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ imageStoragePath: 'users/other-user/dietPlans/owned-stu/1.jpg' }),
      });
      expect(res.status).toBe(400);
      expect(docs.has('dietPlans/owned-stu')).toBe(false);
    } finally {
      close();
    }
  });

  it("400 for a storage path containing '..'", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({
          imageStoragePath: 'users/trainer-1/dietPlans/owned-stu/../../x.jpg',
        }),
      });
      expect(res.status).toBe(400);
    } finally {
      close();
    }
  });
});

// --- FEAT-001: trainer diet-plan reader (GET) -------------------------------
describe('/api/trainer diet-plan GET (FEAT-001)', () => {
  it('200 { dietPlan } for the owning trainer when a plan exists', async () => {
    docs.set('dietPlans/owned-stu', {
      trainerId: 'trainer-1',
      studentUid: 'owned-stu',
      text: 'Saved plan',
      imageStoragePath: null,
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: { text: string } | null } };
      expect(body.data.dietPlan?.text).toBe('Saved plan');
    } finally {
      close();
    }
  });

  it('200 { dietPlan: null } for the owning trainer when no plan exists', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: unknown } };
      expect(body.data.dietPlan).toBeNull();
    } finally {
      close();
    }
  });

  it("404 for another trainer's student", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/diet-plan`, {
        headers: auth('trainer-token'),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });

  it('401 unauthenticated / 403 for a student role', async () => {
    const { url, close } = serve();
    try {
      expect((await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`)).status).toBe(401);
      expect(
        (await fetch(`${url}/api/trainer/students/owned-stu/diet-plan`, { headers: auth('student-token') })).status,
      ).toBe(403);
    } finally {
      close();
    }
  });
});

describe('/api/student/diet-plan fetch (FEAT-002)', () => {
  it('returns the plan assigned by the student\'s active trainer', async () => {
    // student-1 is active with trainer-1, who assigned the plan.
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'active' });
    docs.set('dietPlans/student-1', {
      trainerId: 'trainer-1',
      studentUid: 'student-1',
      text: 'Oats + eggs',
      imageStoragePath: null,
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/diet-plan`, { headers: auth('student-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: { text: string } | null } };
      expect(body.data.dietPlan?.text).toBe('Oats + eggs');
    } finally {
      close();
    }
  });

  it('returns null when the plan was assigned by a DIFFERENT (stale) trainer', async () => {
    // student-1 is now active with trainer-1, but the stored plan is trainer-2's.
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'active' });
    docs.set('dietPlans/student-1', {
      trainerId: 'trainer-2',
      studentUid: 'student-1',
      text: 'Stale plan',
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/diet-plan`, { headers: auth('student-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { dietPlan: unknown } };
      expect(body.data.dietPlan).toBeNull();
    } finally {
      close();
    }
  });

  it('returns null when the student has no active link (pending)', async () => {
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'pending' });
    docs.set('dietPlans/student-1', { trainerId: 'trainer-1', text: 'x' });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/diet-plan`, { headers: auth('student-token') });
      const body = (await res.json()) as { data: { dietPlan: unknown } };
      expect(body.data.dietPlan).toBeNull();
    } finally {
      close();
    }
  });

  it('401 unauthenticated', async () => {
    const { url, close } = serve();
    try {
      expect((await fetch(`${url}/api/student/diet-plan`)).status).toBe(401);
    } finally {
      close();
    }
  });
});

// --- FEAT-003: assigned-workout schedules -----------------------------------
//
// Covers the assign (trainer) + fetch (student) authz matrix:
//   assign owner       -> 200, item stored under assignedWorkouts/{uid}/items
//   assign non-owner   -> 404 (ownership before any write)
//   assign non-trainer -> 403 (requireTrainer first)
//   invalid body       -> 422 (validator)
//   student GET        -> only own ACTIVE-trainer items; [] with no active link
const WORKOUT_DRAFT = {
  name: 'Push Day',
  scheduledDate: '2026-02-01',
  exercises: [
    { exerciseId: 'bench', name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeightKg: 60 },
  ],
};

describe('/api/trainer workouts/assign (FEAT-003)', () => {
  it('owner assigns a workout (200) and stores an item under assignedWorkouts/{uid}/items', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/assign`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify(WORKOUT_DRAFT),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { assignedWorkout: { id: string; name: string; exercises: unknown[] } };
      };
      expect(body.data.assignedWorkout.name).toBe('Push Day');
      expect(body.data.assignedWorkout.exercises).toHaveLength(1);
      const id = body.data.assignedWorkout.id;
      expect(docs.get(`assignedWorkouts/owned-stu/items/${id}`)).toMatchObject({
        trainerId: 'trainer-1',
        studentUid: 'owned-stu',
        name: 'Push Day',
      });
    } finally {
      close();
    }
  });

  it("404 assigning to another trainer's student (no write)", async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/other-stu/workouts/assign`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify(WORKOUT_DRAFT),
      });
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });

  it('403 for a student and a user role', async () => {
    const { url, close } = serve();
    try {
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/workouts/assign`, {
            method: 'POST',
            headers: { ...auth('student-token'), 'content-type': 'application/json' },
            body: JSON.stringify(WORKOUT_DRAFT),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/api/trainer/students/owned-stu/workouts/assign`, {
            method: 'POST',
            headers: { ...auth('user-token'), 'content-type': 'application/json' },
            body: JSON.stringify(WORKOUT_DRAFT),
          })
        ).status,
      ).toBe(403);
    } finally {
      close();
    }
  });

  it('422 for an invalid body (no exercises)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/students/owned-stu/workouts/assign`, {
        method: 'POST',
        headers: { ...auth('trainer-token'), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Empty', scheduledDate: '2026-02-01', exercises: [] }),
      });
      expect(res.status).toBe(422);
    } finally {
      close();
    }
  });
});

describe('/api/student/assigned-workouts fetch (FEAT-003)', () => {
  it('returns only the active trainer items', async () => {
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'active' });
    docs.set('assignedWorkouts/student-1/items/a', {
      id: 'a', trainerId: 'trainer-1', name: 'Mine', scheduledDate: '2026-02-01', exercises: [],
    });
    docs.set('assignedWorkouts/student-1/items/stale', {
      id: 'stale', trainerId: 'trainer-2', name: 'Stale', scheduledDate: '2026-01-01', exercises: [],
    });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/assigned-workouts`, { headers: auth('student-token') });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { assignedWorkouts: Array<{ name: string }> } };
      expect(body.data.assignedWorkouts.map((w) => w.name)).toEqual(['Mine']);
    } finally {
      close();
    }
  });

  it('returns [] when the student has no active link (pending)', async () => {
    docs.set('trainerLinks/student-1', { trainerId: 'trainer-1', status: 'pending' });
    docs.set('assignedWorkouts/student-1/items/x', { id: 'x', trainerId: 'trainer-1', name: 'X', exercises: [] });
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/student/assigned-workouts`, { headers: auth('student-token') });
      const body = (await res.json()) as { data: { assignedWorkouts: unknown[] } };
      expect(body.data.assignedWorkouts).toEqual([]);
    } finally {
      close();
    }
  });

  it('401 unauthenticated', async () => {
    const { url, close } = serve();
    try {
      expect((await fetch(`${url}/api/student/assigned-workouts`)).status).toBe(401);
    } finally {
      close();
    }
  });
});
