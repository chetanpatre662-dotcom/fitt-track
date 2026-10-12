import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regression suite for GET /api/trainer/students (the roster path that 500s in
 * production until the trainerLinks composite index is enabled). The in-memory
 * Firestore mock mirrors trainerRemoveStudent.test.ts, with one addition: the
 * trainerLinks collection records every where()/orderBy() call so we can prove
 * the query shape the composite index must serve cannot silently drift.
 */

const SERVER_TS = { __fv: 'serverTimestamp' };
function increment(n: number) {
  return { __fv: 'increment', n };
}

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;
/** Captured query clauses issued against the trainerLinks collection. */
let trainerLinksQueryCalls: Array<{ kind: 'where' | 'orderBy'; args: unknown[] }>;

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
    delete: async () => {
      docs.delete(path);
    },
  };
}

function makeCollectionRef(base: string) {
  const capture = base === 'trainerLinks';
  const entriesIn = () =>
    [...docs.entries()].filter(([p]) => {
      const rest = p.startsWith(`${base}/`) ? p.slice(base.length + 1) : null;
      return rest !== null && !rest.includes('/');
    });

  const query = (preds: Array<[string, unknown]>) => ({
    where: (field: string, op: string, value: unknown) => {
      if (capture) trainerLinksQueryCalls.push({ kind: 'where', args: [field, op, value] });
      return query([...preds, [field, value]]);
    },
    orderBy: (field: string, dir?: string) => {
      if (capture) trainerLinksQueryCalls.push({ kind: 'orderBy', args: [field, dir] });
      return query(preds);
    },
    limit: (_n: number) => query(preds),
    startAfter: (..._args: unknown[]) => query(preds),
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
    where: (field: string, op: string, value: unknown) => {
      if (capture) trainerLinksQueryCalls.push({ kind: 'where', args: [field, op, value] });
      return query([[field, value]]);
    },
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
      set: (
        ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> },
        data: Doc,
        opts?: { merge?: boolean },
      ) => {
        void ref.set(data, opts);
      },
    };
    return fn(tx);
  },
};

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => firestore,
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
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';

const TRAINER = 'trainer-1';
const OTHER_TRAINER = 'trainer-2';

/** ms-granular updatedAt so the newest-first ordering is deterministic. */
function at(iso: string) {
  const ms = Date.parse(iso);
  return { toMillis: () => ms };
}

/** Seeds a trainer that owns three active students (+ one inactive, pending, rejected). */
function seedRoster(): void {
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('trainers/trainer-1', { trainerId: TRAINER, totalStudents: 3 });

  docs.set('trainerLinks/stu-active-1', {
    studentUid: 'stu-active-1',
    trainerId: TRAINER,
    status: 'active',
    updatedAt: at('2026-01-01T00:00:00.000Z'),
  });
  docs.set('users/stu-active-1/profile/data', { name: 'Ava' });

  docs.set('trainerLinks/stu-active-2', {
    studentUid: 'stu-active-2',
    trainerId: TRAINER,
    status: 'active',
    updatedAt: at('2026-01-03T00:00:00.000Z'),
  });
  docs.set('users/stu-active-2/profile/data', { name: 'Ben' });

  docs.set('trainerLinks/stu-active-3', {
    studentUid: 'stu-active-3',
    trainerId: TRAINER,
    status: 'active',
    updatedAt: at('2026-01-02T00:00:00.000Z'),
  });
  docs.set('users/stu-active-3/profile/data', { name: 'Cara' });

  // Non-active links that must be excluded from the active roster.
  docs.set('trainerLinks/stu-pending', {
    studentUid: 'stu-pending',
    trainerId: TRAINER,
    status: 'pending',
    updatedAt: at('2026-01-04T00:00:00.000Z'),
  });
  docs.set('trainerLinks/stu-rejected', {
    studentUid: 'stu-rejected',
    trainerId: TRAINER,
    status: 'rejected',
    updatedAt: at('2026-01-05T00:00:00.000Z'),
  });
}

beforeEach(() => {
  docs = new Map();
  trainerLinksQueryCalls = [];
  seedRoster();
});

describe('GET /api/trainer/students roster listing (trainerLinks index path)', () => {
  it('(a) a removed student does not reappear in listStudents', async () => {
    await trainerService.removeStudent(TRAINER, 'stu-active-1');

    const roster = await trainerService.listStudents(TRAINER);
    const ids = roster.map((s) => s.studentUid);
    expect(ids).not.toContain('stu-active-1');
    expect(docs.get('trainerLinks/stu-active-1')).toMatchObject({ status: 'inactive' });
  });

  it('(b) active listing returns only status==="active" links', async () => {
    const links = await trainerLinkRepository.listByTrainer(TRAINER);
    const ids = links.map((l) => l.studentUid);
    expect(ids.sort()).toEqual(['stu-active-1', 'stu-active-2', 'stu-active-3']);
    expect(ids).not.toContain('stu-pending');
    expect(ids).not.toContain('stu-rejected');
    // Every returned link is active (no stale status leaks through).
    expect(links.every((l) => l.status === 'active')).toBe(true);
  });

  it('(c) a trainer with zero active links returns [] and does not throw', async () => {
    docs.set('users/trainer-empty', { role: 'trainer' });
    docs.set('trainers/trainer-empty', { trainerId: 'trainer-empty', totalStudents: 0 });

    const roster = await trainerService.listStudents('trainer-empty');
    expect(roster).toEqual([]);
  });

  it('(d) repeated listStudents calls are stable (same ordered result)', async () => {
    const first = await trainerService.listStudents(TRAINER);
    const second = await trainerService.listStudents(TRAINER);
    expect(second.map((s) => s.studentUid)).toEqual(first.map((s) => s.studentUid));
    // Newest-first by updatedAt: active-2 (01-03) > active-3 (01-02) > active-1 (01-01).
    expect(first.map((s) => s.studentUid)).toEqual([
      'stu-active-2',
      'stu-active-3',
      'stu-active-1',
    ]);
  });

  it('(e) other active students still load after one is removed', async () => {
    await trainerService.removeStudent(TRAINER, 'stu-active-2');

    const roster = await trainerService.listStudents(TRAINER);
    const ids = roster.map((s) => s.studentUid);
    expect(ids).toEqual(['stu-active-3', 'stu-active-1']);
    expect(ids).toHaveLength(2);
  });

  it('(f) removing a student does not affect another trainer\'s roster (isolation)', async () => {
    // trainer-2 owns their own active student.
    docs.set('users/trainer-2', { role: 'trainer' });
    docs.set('trainers/trainer-2', { trainerId: OTHER_TRAINER, totalStudents: 1 });
    docs.set('trainerLinks/stu-other', {
      studentUid: 'stu-other',
      trainerId: OTHER_TRAINER,
      status: 'active',
      updatedAt: at('2026-01-06T00:00:00.000Z'),
    });
    docs.set('users/stu-other/profile/data', { name: 'Dee' });

    // Remove one of trainer-1's students.
    await trainerService.removeStudent(TRAINER, 'stu-active-1');

    // trainer-2's roster is untouched and still listable.
    const otherRoster = await trainerService.listStudents(OTHER_TRAINER);
    expect(otherRoster.map((s) => s.studentUid)).toEqual(['stu-other']);
    expect(docs.get('trainerLinks/stu-other')).toMatchObject({
      trainerId: OTHER_TRAINER,
      status: 'active',
    });
  });

  it('(g) listByTrainer issues the exact index query shape', async () => {
    trainerLinksQueryCalls = [];
    await trainerLinkRepository.listByTrainer(TRAINER);

    const wheres = trainerLinksQueryCalls.filter((c) => c.kind === 'where').map((c) => c.args);
    const orderBys = trainerLinksQueryCalls.filter((c) => c.kind === 'orderBy').map((c) => c.args);

    expect(wheres).toEqual([
      ['trainerId', '==', TRAINER],
      ['status', '==', 'active'],
    ]);
    expect(orderBys).toEqual([['updatedAt', 'desc']]);
  });
});
