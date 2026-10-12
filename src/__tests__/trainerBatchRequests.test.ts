import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

/**
 * Batch approve/reject (§6). The first block exercises the service directly
 * (dedupe + per-item revalidation + partial-failure reporting + idempotency)
 * over the in-memory Firestore mock; the second block boots the real trainer
 * router to prove the literal `batch/approve|reject` routes resolve to the
 * batch handler while `/requests/:studentUid/approve|reject` still resolve to
 * the single handler (route-collision guard).
 */

const SERVER_TS = { __fv: 'serverTimestamp' };
function increment(n: number) {
  return { __fv: 'increment', n };
}

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;
/** Bearer token -> uid, for the route-collision block. */
const TOKENS: Record<string, string> = {
  'trainer-token': 'trainer-1',
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
    id: path.split('/').pop() as string,
    path,
    collection: (sub: string) => makeCollectionRef(`${path}/${sub}`),
    get: async () => ({
      exists: docs.has(path),
      id: path.split('/').pop() as string,
      data: () => docs.get(path),
    }),
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
    where: (field: string, _op: string, value: unknown) => query([...preds, [field, value]]),
    orderBy: (_field: string, _dir?: string) => query(preds),
    limit: (_n: number) => query(preds),
    get: async () => {
      const matched = entriesIn().filter(([, data]) => preds.every(([f, v]) => data[f] === v));
      return {
        size: matched.length,
        docs: matched.map(([p, data]) => ({ id: p.split('/').pop(), data: () => data })),
      };
    },
  });

  return {
    doc: (id?: string) => makeDocRef(`${base}/${id ?? `auto-${docs.size}`}`),
    where: (field: string, _op: string, value: unknown) => query([[field, value]]),
    get: async () => {
      const matched = entriesIn();
      return {
        size: matched.length,
        docs: matched.map(([p, data]) => ({ id: p.split('/').pop(), data: () => data })),
      };
    },
  };
}

const firestore = {
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
};

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => firestore,
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      const uid = TOKENS[token];
      if (!uid) throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' });
      return { uid };
    },
  }),
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SERVER_TS,
        increment: (n: number) => increment(n),
      },
    },
  },
}));

import { trainerService } from '../services/trainerService.js';
import trainerRoutes from '../routes/trainer.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const TRAINER = 'trainer-1';

beforeEach(() => {
  docs = new Map();
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('trainers/trainer-1', { trainerId: TRAINER, totalStudents: 0 });
});

describe('TrainerService.batchApproveRequests', () => {
  beforeEach(() => {
    // Two pending requests owned by trainer-1.
    docs.set('trainerLinks/p1', { trainerId: TRAINER, status: 'pending' });
    docs.set('users/p1/profile/data', { name: 'P1' });
    docs.set('trainerLinks/p2', { trainerId: TRAINER, status: 'pending' });
    docs.set('users/p2/profile/data', { name: 'P2' });
    // A foreign pending request + an already-active (processed) link.
    docs.set('trainerLinks/foreign', { trainerId: 'trainer-2', status: 'pending' });
    docs.set('trainerLinks/processed', { trainerId: TRAINER, status: 'active' });
  });

  it('approves owned-pending ids and reports foreign/processed as not_found', async () => {
    const res = await trainerService.batchApproveRequests(TRAINER, [
      'p1',
      'p2',
      'foreign',
      'processed',
    ]);

    expect(res.summary).toEqual({ approved: 2, failed: 2 });
    const byUid = Object.fromEntries(res.results.map((r) => [r.studentUid, r]));
    expect(byUid.p1).toEqual({ studentUid: 'p1', ok: true, status: 'active' });
    expect(byUid.p2).toEqual({ studentUid: 'p2', ok: true, status: 'active' });
    expect(byUid.foreign).toEqual({ studentUid: 'foreign', ok: false, reason: 'not_found' });
    expect(byUid.processed).toEqual({ studentUid: 'processed', ok: false, reason: 'not_found' });

    // Owned pending links are now active; the others are untouched/unapproved.
    expect(docs.get('trainerLinks/p1')).toMatchObject({ status: 'active' });
    expect(docs.get('trainerLinks/p2')).toMatchObject({ status: 'active' });
    expect(docs.get('trainerLinks/foreign')).toMatchObject({ trainerId: 'trainer-2', status: 'pending' });
    // Exactly two approvals counted once each.
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(2);
  });

  it('dedupes a repeated uid: processed + counted once', async () => {
    const res = await trainerService.batchApproveRequests(TRAINER, ['p1', 'p1', 'p1']);
    expect(res.results).toHaveLength(1);
    expect(res.summary).toEqual({ approved: 1, failed: 0 });
    expect(res.results[0]).toEqual({ studentUid: 'p1', ok: true, status: 'active' });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('is idempotent: re-approving an already-approved id in a later batch is a not_found failure', async () => {
    await trainerService.batchApproveRequests(TRAINER, ['p1']);
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
    const second = await trainerService.batchApproveRequests(TRAINER, ['p1']);
    expect(second.summary).toEqual({ approved: 0, failed: 1 });
    expect(second.results[0]).toEqual({ studentUid: 'p1', ok: false, reason: 'not_found' });
    // No double count.
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });
});

describe('TrainerService.batchRejectRequests', () => {
  beforeEach(() => {
    docs.set('trainerLinks/p1', { trainerId: TRAINER, status: 'pending' });
    docs.set('trainerLinks/foreign', { trainerId: 'trainer-2', status: 'pending' });
  });

  it('rejects owned-pending ids and reports foreign as not_found', async () => {
    const res = await trainerService.batchRejectRequests(TRAINER, ['p1', 'foreign']);
    expect(res.summary).toEqual({ rejected: 1, failed: 1 });
    const byUid = Object.fromEntries(res.results.map((r) => [r.studentUid, r]));
    expect(byUid.p1).toEqual({ studentUid: 'p1', ok: true, status: 'rejected' });
    expect(byUid.foreign).toEqual({ studentUid: 'foreign', ok: false, reason: 'not_found' });
    expect(docs.get('trainerLinks/p1')).toMatchObject({ status: 'rejected' });
    expect(docs.get('trainerLinks/foreign')).toMatchObject({ status: 'pending' });
  });
});

describe('batch route-collision guard', () => {
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
  const auth = { Authorization: 'Bearer trainer-token' };

  beforeEach(() => {
    docs.set('trainerLinks/p1', { trainerId: TRAINER, status: 'pending' });
    docs.set('users/p1/profile/data', { name: 'P1' });
    docs.set('trainerLinks/single', { trainerId: TRAINER, status: 'pending' });
    docs.set('users/single/profile/data', { name: 'Single' });
  });

  it('POST /requests/batch/approve resolves to the BATCH handler (returns results/summary)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/batch/approve`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ studentUids: ['p1'] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { results: Array<{ studentUid: string }>; summary: { approved: number } };
      };
      // Batch envelope — NOT the single-item { ok, studentUid, status } shape.
      expect(Array.isArray(body.data.results)).toBe(true);
      expect(body.data.summary.approved).toBe(1);
      expect(docs.get('trainerLinks/p1')).toMatchObject({ status: 'active' });
    } finally {
      close();
    }
  });

  it('POST /requests/batch/reject resolves to the BATCH handler', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/batch/reject`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ studentUids: ['p1'] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { summary: { rejected: number } } };
      expect(body.data.summary.rejected).toBe(1);
      expect(docs.get('trainerLinks/p1')).toMatchObject({ status: 'rejected' });
    } finally {
      close();
    }
  });

  it('POST /requests/:studentUid/approve still resolves to the SINGLE handler', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/single/approve`, {
        method: 'POST',
        headers: auth,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { ok: boolean; studentUid: string; status: string } };
      // Single-item envelope — NOT the batch results/summary shape.
      expect(body.data).toMatchObject({ ok: true, studentUid: 'single', status: 'active' });
      expect(docs.get('trainerLinks/single')).toMatchObject({ status: 'active' });
    } finally {
      close();
    }
  });

  it('the literal batch segment is never captured as a :studentUid (empty body -> 422, not a per-student 404)', async () => {
    const { url, close } = serve();
    try {
      const res = await fetch(`${url}/api/trainer/requests/batch/approve`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      // The batch validator rejects a missing studentUids array (422); if the
      // param route had captured 'batch', this would 404 on ownership instead.
      expect(res.status).toBe(422);
    } finally {
      close();
    }
  });
});
