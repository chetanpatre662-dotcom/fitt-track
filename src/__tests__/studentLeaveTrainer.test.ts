import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * In-memory Firestore mock (same shape as trainerRemoveStudent.test.ts) covering
 * the collections the leave-trainer path touches: trainerLinks/{studentUid} and
 * users/{uid}/profile/data (+ the student's own subcollections). We assert the
 * exact set of docs touched so the §4 non-destructive guarantee is provable: the
 * link flips to 'inactive', the profile mirror is cleared, and NOTHING else
 * under users/{studentUid}/** is written or deleted. The transaction is keyed by
 * the authenticated uid, so a student can only ever affect their own link.
 */

const SERVER_TS = { __fv: 'serverTimestamp' };
function increment(n: number) {
  return { __fv: 'increment', n };
}

type Doc = Record<string, unknown>;
let docs: Map<string, Doc>;
/** Paths that were deleted via doc().delete() (none expected here). */
let deletedPaths: string[];

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
      deletedPaths.push(path);
      docs.delete(path);
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
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SERVER_TS,
        increment: (n: number) => increment(n),
      },
    },
  },
}));

import { studentService } from '../services/studentService.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';

const TRAINER = 'trainer-1';
const STUDENT = 'stu-1';
const OTHER_STUDENT = 'stu-2';

/** Seeds the student's own personal data (must always survive untouched). */
function seedStudentData(): void {
  docs.set(`users/${STUDENT}/workouts/w1`, { name: 'Push Day', status: 'completed', totalVolume: 5000 });
  docs.set(`users/${STUDENT}/foodLogs/f1`, { dateKey: '2026-01-05', calories: 200 });
  docs.set(`users/${STUDENT}/waterLogs/wl1`, { dateKey: '2026-01-05', amountMl: 500 });
}

/** Seeds an ACTIVE trainer-student link plus the mirrored profile. */
function seedActiveLink(): void {
  docs.set('trainers/trainer-1', { trainerId: TRAINER, totalStudents: 1 });
  docs.set(`trainerLinks/${STUDENT}`, { studentUid: STUDENT, trainerId: TRAINER, status: 'active' });
  docs.set(`users/${STUDENT}/profile/data`, {
    name: 'Nina',
    trainerId: TRAINER,
    trainerStatus: 'approved',
    weightKg: 60,
  });
  seedStudentData();
}

/** Seeds a PENDING request plus a profile with no mirror set yet. */
function seedPendingLink(): void {
  docs.set('trainers/trainer-1', { trainerId: TRAINER, totalStudents: 0 });
  docs.set(`trainerLinks/${STUDENT}`, { studentUid: STUDENT, trainerId: TRAINER, status: 'pending' });
  docs.set(`users/${STUDENT}/profile/data`, { name: 'Nina', weightKg: 60 });
  seedStudentData();
}

beforeEach(() => {
  docs = new Map();
  deletedPaths = [];
});

describe('StudentService.leaveTrainer', () => {
  it('active -> inactive, clears the profile mirror, and reports previousStatus', async () => {
    seedActiveLink();
    const res = await studentService.leaveTrainer(STUDENT);
    expect(res).toEqual({ ok: true, previousStatus: 'active', status: 'inactive' });

    expect(docs.get(`trainerLinks/${STUDENT}`)).toMatchObject({ status: 'inactive' });
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({
      trainerId: null,
      trainerStatus: null,
    });
  });

  it('pending -> inactive (withdraw), clears the mirror, previousStatus pending', async () => {
    seedPendingLink();
    const res = await studentService.leaveTrainer(STUDENT);
    expect(res).toEqual({ ok: true, previousStatus: 'pending', status: 'inactive' });

    expect(docs.get(`trainerLinks/${STUDENT}`)).toMatchObject({ status: 'inactive' });
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({
      trainerId: null,
      trainerStatus: null,
    });
  });

  it('rejected -> idempotent no-op success (no write), previousStatus rejected', async () => {
    docs.set(`trainerLinks/${STUDENT}`, { studentUid: STUDENT, trainerId: TRAINER, status: 'rejected' });
    docs.set(`users/${STUDENT}/profile/data`, { name: 'Nina', weightKg: 60 });
    const before = JSON.stringify(docs.get(`trainerLinks/${STUDENT}`));

    const res = await studentService.leaveTrainer(STUDENT);
    expect(res).toEqual({ ok: true, previousStatus: 'rejected', status: 'inactive' });
    // No write on a rejected link.
    expect(JSON.stringify(docs.get(`trainerLinks/${STUDENT}`))).toBe(before);
  });

  it('inactive -> idempotent no-op success (no write), previousStatus inactive', async () => {
    docs.set(`trainerLinks/${STUDENT}`, { studentUid: STUDENT, trainerId: TRAINER, status: 'inactive' });
    const before = JSON.stringify(docs.get(`trainerLinks/${STUDENT}`));

    const res = await studentService.leaveTrainer(STUDENT);
    expect(res).toEqual({ ok: true, previousStatus: 'inactive', status: 'inactive' });
    expect(JSON.stringify(docs.get(`trainerLinks/${STUDENT}`))).toBe(before);
  });

  it('no link doc -> previousStatus none, writes nothing', async () => {
    const res = await studentService.leaveTrainer(STUDENT);
    expect(res).toEqual({ ok: true, previousStatus: 'none', status: 'inactive' });
    expect(docs.has(`trainerLinks/${STUDENT}`)).toBe(false);
    expect(docs.has(`users/${STUDENT}/profile/data`)).toBe(false);
  });

  it('is non-destructive: touches no other users/{studentUid}/** data and deletes nothing', async () => {
    seedActiveLink();
    await studentService.leaveTrainer(STUDENT);

    expect(docs.get(`users/${STUDENT}/workouts/w1`)).toMatchObject({ name: 'Push Day', totalVolume: 5000 });
    expect(docs.get(`users/${STUDENT}/foodLogs/f1`)).toMatchObject({ calories: 200 });
    expect(docs.get(`users/${STUDENT}/waterLogs/wl1`)).toMatchObject({ amountMl: 500 });
    // The student's profile still exists (only the trainer mirror was cleared).
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({ name: 'Nina', weightKg: 60 });
    // Nothing was deleted anywhere.
    expect(deletedPaths).toEqual([]);
  });

  it('writes nothing on the trainer doc (no counter change)', async () => {
    seedActiveLink();
    await studentService.leaveTrainer(STUDENT);
    // totalStudents is left exactly as seeded; the live count self-corrects.
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('removes the student from the trainer roster (link no longer active)', async () => {
    seedActiveLink();
    await studentService.leaveTrainer(STUDENT);
    const roster = await trainerLinkRepository.listByTrainer(TRAINER);
    expect(roster.find((l) => l.studentUid === STUDENT)).toBeUndefined();
  });

  it('double-leave is safe: the second call no-ops with previousStatus inactive', async () => {
    seedActiveLink();
    const first = await studentService.leaveTrainer(STUDENT);
    expect(first.previousStatus).toBe('active');
    const second = await studentService.leaveTrainer(STUDENT);
    expect(second).toEqual({ ok: true, previousStatus: 'inactive', status: 'inactive' });
    expect(docs.get(`trainerLinks/${STUDENT}`)).toMatchObject({ status: 'inactive' });
  });

  it('a student can only affect their OWN link (uid-keyed), never another student', async () => {
    seedActiveLink();
    docs.set(`trainerLinks/${OTHER_STUDENT}`, {
      studentUid: OTHER_STUDENT,
      trainerId: TRAINER,
      status: 'active',
    });
    const otherBefore = JSON.stringify(docs.get(`trainerLinks/${OTHER_STUDENT}`));

    await studentService.leaveTrainer(STUDENT);

    // The other student's link is byte-for-byte unchanged.
    expect(JSON.stringify(docs.get(`trainerLinks/${OTHER_STUDENT}`))).toBe(otherBefore);
  });

  it('returns the single response shape for every branch', async () => {
    seedActiveLink();
    const res = await studentService.leaveTrainer(STUDENT);
    expect(Object.keys(res).sort()).toEqual(['ok', 'previousStatus', 'status']);
    expect(res.ok).toBe(true);
    expect(res.status).toBe('inactive');
  });
});
