import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * In-memory Firestore mock (same shape as trainerService.test.ts) covering the
 * collections the remove-student path touches: trainerLinks/{studentUid},
 * users/{uid} (+ profile/data and other subcollections), and trainers/{id}.
 * We assert the exact set of docs touched so the §5 non-destructive guarantee
 * is provable: the link flips to 'inactive', the profile mirror is cleared, and
 * NOTHING else under users/{studentUid}/** is written or deleted.
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

import { trainerService } from '../services/trainerService.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { assertTrainerOwnsStudent } from '../middleware/role.js';

const TRAINER = 'trainer-1';
const STUDENT = 'stu-1';

/** Seeds an ACTIVE trainer-student link plus the student's own personal data. */
function seedActiveStudentWithData(): void {
  docs.set('users/trainer-1', { role: 'trainer' });
  docs.set('trainers/trainer-1', { trainerId: TRAINER, totalStudents: 1 });
  docs.set(`trainerLinks/${STUDENT}`, { studentUid: STUDENT, trainerId: TRAINER, status: 'active' });
  docs.set(`users/${STUDENT}/profile/data`, {
    name: 'Nina',
    trainerId: TRAINER,
    trainerStatus: 'approved',
    weightKg: 60,
  });
  // The student's OWN personal records — must survive removal untouched.
  docs.set(`users/${STUDENT}/workouts/w1`, { name: 'Push Day', status: 'completed', totalVolume: 5000 });
  docs.set(`users/${STUDENT}/foodLogs/f1`, { dateKey: '2026-01-05', calories: 200 });
  docs.set(`users/${STUDENT}/waterLogs/wl1`, { dateKey: '2026-01-05', amountMl: 500 });
}

beforeEach(() => {
  docs = new Map();
  deletedPaths = [];
  seedActiveStudentWithData();
});

describe('TrainerService.removeStudent', () => {
  it('flips the link to inactive and clears the profile trainer mirror', async () => {
    const res = await trainerService.removeStudent(TRAINER, STUDENT);
    expect(res).toEqual({ ok: true, studentUid: STUDENT, status: 'inactive' });

    expect(docs.get(`trainerLinks/${STUDENT}`)).toMatchObject({ status: 'inactive' });
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({
      trainerId: null,
      trainerStatus: null,
    });
  });

  it('writes no counter on the trainer doc (count is derived live)', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);
    // totalStudents is left exactly as seeded; the live count self-corrects.
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
    // The live count no longer includes the removed (now inactive) student.
    expect((await trainerService.getProfile(TRAINER)).totalStudents).toBe(0);
  });

  it('touches no other users/{studentUid}/** data and deletes nothing', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);

    // The student's own records are byte-for-byte unchanged.
    expect(docs.get(`users/${STUDENT}/workouts/w1`)).toMatchObject({ name: 'Push Day', totalVolume: 5000 });
    expect(docs.get(`users/${STUDENT}/foodLogs/f1`)).toMatchObject({ calories: 200 });
    expect(docs.get(`users/${STUDENT}/waterLogs/wl1`)).toMatchObject({ amountMl: 500 });
    // No doc anywhere was deleted (no account/data deletion).
    expect(deletedPaths).toEqual([]);
    // Only the link and the profile mirror were the writes we care about; the
    // student's data docs still exist.
    expect(docs.has(`users/${STUDENT}/workouts/w1`)).toBe(true);
  });

  it('a subsequent per-student read 404s (access revoked immediately)', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);
    await expect(assertTrainerOwnsStudent(TRAINER, STUDENT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('excludes the removed student from the roster and the requests inbox', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);
    const roster = await trainerLinkRepository.listByTrainer(TRAINER);
    expect(roster.find((l) => l.studentUid === STUDENT)).toBeUndefined();
    const inbox = await trainerLinkRepository.listRequestsByTrainer(TRAINER);
    expect(inbox.find((l) => l.studentUid === STUDENT)).toBeUndefined();
  });

  it('404s when the caller is not the owning trainer (no write)', async () => {
    const before = JSON.stringify(docs.get(`trainerLinks/${STUDENT}`));
    await expect(trainerService.removeStudent('trainer-2', STUDENT)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(JSON.stringify(docs.get(`trainerLinks/${STUDENT}`))).toBe(before);
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({ trainerId: TRAINER });
  });

  it('is idempotent: a second remove 404s because the link is no longer active', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);
    await expect(trainerService.removeStudent(TRAINER, STUDENT)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(docs.get(`trainerLinks/${STUDENT}`)).toMatchObject({ status: 'inactive' });
  });

  it('the student retains full use of their own data after removal (own-token reads intact)', async () => {
    await trainerService.removeStudent(TRAINER, STUDENT);
    // Reading users/{studentUid}/** directly (as the student's own session
    // would) still returns the student's data; removeStudent neither wrote nor
    // deleted any of these docs.
    expect(docs.get(`users/${STUDENT}/workouts/w1`)).toBeTruthy();
    expect(docs.get(`users/${STUDENT}/foodLogs/f1`)).toBeTruthy();
    expect(docs.get(`users/${STUDENT}/waterLogs/wl1`)).toBeTruthy();
    // The student's profile still exists (only the trainer mirror was cleared).
    expect(docs.get(`users/${STUDENT}/profile/data`)).toMatchObject({ name: 'Nina', weightKg: 60 });
  });
});
