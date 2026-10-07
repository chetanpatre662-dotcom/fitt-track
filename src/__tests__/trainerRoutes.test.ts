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
    get: async () => {
      const m = entriesIn().filter(([, d]) => preds.every(([f, v]) => d[f] === v));
      return { size: m.length, docs: m.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
    },
  });
  return {
    doc: (id?: string) => makeDocRef(`${base}/${id ?? `auto-${docs.size}`}`),
    where: (f: string, _o: string, v: unknown) => query([[f, v]]),
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
  getBucket: () => ({ file: () => ({ getSignedUrl: async () => ['https://signed.example/x'] }) }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({}), increment: (n: number) => ({ __fv: 'increment', n }) },
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
