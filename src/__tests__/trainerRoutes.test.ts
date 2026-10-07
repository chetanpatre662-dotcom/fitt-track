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
};

function makeDocRef(path: string) {
  return {
    collection: (sub: string) => makeCollectionRef(`${path}/${sub}`),
    get: async () => ({ exists: docs.has(path), id: path.split('/').pop(), data: () => docs.get(path) }),
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
  getFirestore: () => ({ collection: (name: string) => makeCollectionRef(name) }),
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

beforeEach(() => {
  docs = new Map();
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('trainers/trainer-1', { trainerId: 'trainer-1', name: 'Dream Physics', referralCode: 'dreamphysics', totalStudents: 1 });
  docs.set('users/student-1', { role: 'student' });
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
