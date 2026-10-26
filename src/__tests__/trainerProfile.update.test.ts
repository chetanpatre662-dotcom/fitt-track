import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

/**
 * PATCH /api/trainer/profile contract tests (FEAT-001 Part 1). Mirrors the
 * in-memory-Firestore + real-router style of trainerRoutes.test.ts: the Firebase
 * config is mocked so a Bearer token maps to a uid and an in-memory Firestore
 * backs role resolution + the trainers/{uid} write, while the REAL trainer
 * router, auth + role middleware, validators and error handler run end-to-end.
 *
 * Focus: the 10-digit mobile contract now in trainerProfileSchema, that a write
 * targets the CALLER's own trainers/<uid> (the body carries no uid), and that
 * completeness is recomputed on the merged document.
 */

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;

/** Bearer token -> uid. */
const TOKENS: Record<string, string> = {
  'trainer-a-token': 'trainer-a',
  'trainer-b-token': 'trainer-b',
  'student-token': 'student-1',
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
  getBucket: () => ({ file: () => ({ getSignedUrl: async () => ['https://signed.example/x'], delete: async () => undefined }) }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({}), increment: (n: number) => ({ __fv: 'increment', n }) },
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

function patch(url: string, token: string | undefined, body: unknown) {
  return fetch(`${url}/api/trainer/profile`, {
    method: 'PATCH',
    headers: { ...auth(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  docs = new Map();
  docs.set('users/trainer-a', { role: 'trainer' });
  docs.set('trainers/trainer-a', { trainerId: 'trainer-a', name: 'Alex Carter', status: 'active' });
  docs.set('users/trainer-b', { role: 'trainer' });
  docs.set('trainers/trainer-b', { trainerId: 'trainer-b', name: 'Bela Rao', status: 'active' });
  docs.set('users/student-1', { role: 'student' });
});

describe('PATCH /api/trainer/profile — 10-digit mobile contract (FEAT-001)', () => {
  it('(a) 200 for a valid 10-digit body; writes to the caller doc and recomputes completeness', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', {
        name: 'Alex Carter',
        mobile: '9876543210',
        dateOfBirth: '1990-05-01',
        heightCm: 182.5,
        weightKg: 80.4,
        experience: '5 years',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { profile: { profileCompleted: boolean } } };
      expect(body.data.profile.profileCompleted).toBe(true);
      // The write targets the CALLER's trainers/<uid>, and decimals are kept.
      expect(docs.get('trainers/trainer-a')).toMatchObject({
        trainerId: 'trainer-a',
        mobile: '9876543210',
        heightCm: 182.5,
        weightKg: 80.4,
        profileCompleted: true,
      });
    } finally {
      close();
    }
  });

  it('(a2) a partial patch stays incomplete until every required field is present', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', { mobile: '9876543210' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { profile: { profileCompleted: boolean } } };
      expect(body.data.profile.profileCompleted).toBe(false);
      expect(docs.get('trainers/trainer-a')).toMatchObject({ mobile: '9876543210' });
    } finally {
      close();
    }
  });

  it('(b) 401 when unauthenticated', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, undefined, { mobile: '9876543210' });
      expect(res.status).toBe(401);
    } finally {
      close();
    }
  });

  it('(c) 422 for a 9-digit mobile', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', { mobile: '987654321' });
      expect(res.status).toBe(422);
    } finally {
      close();
    }
  });

  it('(c2) 422 for an unknown key (.strict)', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', { mobile: '9876543210', nickname: 'ace' });
      expect(res.status).toBe(422);
      // A rejected body writes nothing.
      expect(docs.get('trainers/trainer-a')).not.toHaveProperty('mobile');
    } finally {
      close();
    }
  });

  it('(d) a trainer token only mutates ITS OWN doc (body carries no uid)', async () => {
    const { url, close } = serve();
    try {
      // trainer A edits. Even a (rejected) attempt to smuggle a uid cannot
      // retarget the write — but we assert the positive case: A's write lands
      // on trainers/trainer-a and never touches trainers/trainer-b.
      const res = await patch(url, 'trainer-a-token', { bio: 'Coaching since 2015.' });
      expect(res.status).toBe(200);
      expect(docs.get('trainers/trainer-a')).toMatchObject({ bio: 'Coaching since 2015.' });
      expect(docs.get('trainers/trainer-b')).not.toHaveProperty('bio');
    } finally {
      close();
    }
  });

  it('403 when a student token attempts the PATCH', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'student-token', { bio: 'x' });
      expect(res.status).toBe(403);
    } finally {
      close();
    }
  });
});

/**
 * Route-registration regression guard (root cause of the shipped 404 "Route not
 * found: PATCH /api/trainer/profile"). The handler lived in src/ but the tracked
 * compiled dist/ was stale and omitted it, so the deployed server fell through
 * to the not-found handler. These cases pin the method+path to the trainer
 * router and the exact nine-field onboarding body the Flutter Step-2 Save sends.
 */
describe('PATCH /api/trainer/profile — route registration + onboarding body', () => {
  // The verbatim nine-field payload the frontend builds in public_profile_step.
  const onboardingBody = {
    name: 'Alex Carter',
    mobile: '9876543210',
    dateOfBirth: '1990-05-01',
    heightCm: 182,
    weightKg: 80,
    experience: '5 years',
    bio: 'Coaching since 2015.',
    youtubeUrl: '',
    instagramUrl: '',
  };

  it('the PATCH /profile route IS registered (a valid call is NOT a 404/405)', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', onboardingBody);
      // The precise failure this fix addresses: a missing route yields 404 and
      // the not-found body. Assert we are neither 404 (unrouted) nor 405.
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
      expect(res.status).toBe(200);
    } finally {
      close();
    }
  });

  it('accepts the full nine-field onboarding body with BLANK optional social URLs', async () => {
    const { url, close } = serve();
    try {
      const res = await patch(url, 'trainer-a-token', onboardingBody);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { profile: { profileCompleted: boolean } };
      };
      expect(body.data.profile.profileCompleted).toBe(true);
      // experience + bio persisted; blank optional URLs are stored as null
      // (the service's intentional "cleared" representation so the student
      // projection omits them) — accepted without a spurious validation error.
      expect(docs.get('trainers/trainer-a')).toMatchObject({
        experience: '5 years',
        bio: 'Coaching since 2015.',
        youtubeUrl: null,
        instagramUrl: null,
      });
    } finally {
      close();
    }
  });

  it('a later partial patch PRESERVES unrelated fields (merge, no null-overwrite)', async () => {
    const { url, close } = serve();
    try {
      const first = await patch(url, 'trainer-a-token', onboardingBody);
      expect(first.status).toBe(200);
      // Edit only the bio; everything else must survive the merge.
      const second = await patch(url, 'trainer-a-token', { bio: 'Updated bio.' });
      expect(second.status).toBe(200);
      expect(docs.get('trainers/trainer-a')).toMatchObject({
        mobile: '9876543210',
        experience: '5 years',
        bio: 'Updated bio.',
        heightCm: 182,
        weightKg: 80,
        profileCompleted: true,
      });
    } finally {
      close();
    }
  });

  it('an unsupported method on the same path does NOT succeed (POST is unrouted)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/profile`, {
        method: 'POST',
        headers: { ...auth('trainer-a-token'), 'content-type': 'application/json' },
        body: JSON.stringify(onboardingBody),
      });
      // No POST handler is registered: it must not quietly succeed.
      expect(res.status).not.toBe(200);
      expect(res.status).toBe(404);
    } finally {
      close();
    }
  });
});
