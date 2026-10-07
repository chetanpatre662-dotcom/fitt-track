import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * In-memory Firestore mock covering the collections the trainer slice touches:
 *   - trainers/{id}
 *   - referralCodes/{code}
 *   - trainerLinks/{studentUid}
 *   - users/{uid} (+ profile/data, workouts, foodLogs, waterLogs subcollections)
 *
 * Supports .doc().get()/.set(), .where().get(), collection subpaths, and
 * runTransaction with tx.get/tx.set. FieldValue.increment and serverTimestamp
 * are modelled so totalStudents math is observable.
 */

const SERVER_TS = { __fv: 'serverTimestamp' };
function increment(n: number) {
  return { __fv: 'increment', n };
}

type Doc = Record<string, unknown>;
/** path string -> doc data. Path form: "col/id" or "col/id/sub/id2". */
let docs: Map<string, Doc>;

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
  getBucket: () => ({ file: () => ({ getSignedUrl: async () => ['https://signed.example/x'] }) }),
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
import { assertTrainerOwnsStudent } from '../middleware/role.js';
import { roleService } from '../services/roleService.js';

const TRAINER = 'trainer-1';

beforeEach(() => {
  docs = new Map();
  // Seed a trainer + referral code.
  docs.set('trainers/trainer-1', {
    trainerId: TRAINER,
    name: 'Dream Physics',
    referralCode: 'dreamphysics',
    referralCodeLower: 'dreamphysics',
    status: 'active',
    totalStudents: 0,
  });
  docs.set('referralCodes/dreamphysics', { trainerId: TRAINER });
});

describe('TrainerService.linkStudent', () => {
  it('links a valid code, creates the link, mirrors profile, increments once', async () => {
    const res = await trainerService.linkStudent('stu-1', 'DreamPhysics');
    expect(res.linked).toBe(true);
    expect(res.trainerId).toBe(TRAINER);
    expect(res.trainerName).toBe('Dream Physics');

    expect(docs.get('trainerLinks/stu-1')).toMatchObject({ trainerId: TRAINER, status: 'active' });
    expect(docs.get('users/stu-1/profile/data')).toMatchObject({ trainerId: TRAINER });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('normalizes case/whitespace in the referral code', async () => {
    const res = await trainerService.linkStudent('stu-2', '  DREAMPHYSICS  ');
    expect(res.linked).toBe(true);
    expect(docs.get('trainerLinks/stu-2')).toBeTruthy();
  });

  it('returns a soft failure (no link, no increment) for an invalid code', async () => {
    const res = await trainerService.linkStudent('stu-3', 'nope');
    expect(res).toEqual({ linked: false, reason: 'invalid_code' });
    expect(docs.has('trainerLinks/stu-3')).toBe(false);
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(0);
  });

  it('is idempotent: re-linking the same trainer does not double count', async () => {
    await trainerService.linkStudent('stu-4', 'dreamphysics');
    await trainerService.linkStudent('stu-4', 'dreamphysics');
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('rejects a trainer account trying to link as a student (409)', async () => {
    docs.set('users/trainer-x', { role: 'trainer' });
    await expect(trainerService.linkStudent('trainer-x', 'dreamphysics')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('assertTrainerOwnsStudent', () => {
  beforeEach(() => {
    docs.set('trainerLinks/owned', { trainerId: TRAINER, status: 'active' });
    docs.set('trainerLinks/other', { trainerId: 'trainer-2', status: 'active' });
    docs.set('trainerLinks/inactive', { trainerId: TRAINER, status: 'inactive' });
  });

  it('passes for an owned active student', async () => {
    await expect(assertTrainerOwnsStudent(TRAINER, 'owned')).resolves.toBeUndefined();
  });

  it("throws 404 for another trainer's student", async () => {
    await expect(assertTrainerOwnsStudent(TRAINER, 'other')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for a missing link', async () => {
    await expect(assertTrainerOwnsStudent(TRAINER, 'ghost')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for an inactive link', async () => {
    await expect(assertTrainerOwnsStudent(TRAINER, 'inactive')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('RoleService.resolveRole (trainer vs student)', () => {
  it('resolves a seeded trainer uid to trainer', async () => {
    docs.set('users/trainer-1', { role: 'trainer' });
    expect(await roleService.resolveRole('trainer-1')).toBe('trainer');
  });

  it('resolves an unknown uid to student', async () => {
    expect(await roleService.resolveRole('nobody')).toBe('student');
  });
});

describe('TrainerService trainer-reads-student round trips', () => {
  beforeEach(() => {
    docs.set('trainerLinks/stu-nut', { trainerId: TRAINER, status: 'active', createdAt: SERVER_TS });
    docs.set('users/stu-nut/profile/data', { name: 'Nina', goals: ['lose_weight'], weightKg: 60, shareProgressWithTrainer: true });
  });

  it('reads the student nutrition day through nutritionService', async () => {
    docs.set('users/stu-nut/foodLogs/f1', {
      dateKey: '2026-01-05',
      mealType: 'breakfast',
      name: 'Oats',
      calories: 200,
      protein: 10,
    });

    await assertTrainerOwnsStudent(TRAINER, 'stu-nut');
    const day = await trainerService.studentNutrition('stu-nut', '2026-01-05');
    expect(day.entries).toHaveLength(1);
    expect(day.totals.calories).toBe(200);
  });

  it('profile getProfile uses a live active-student count', async () => {
    docs.set('trainerLinks/a', { trainerId: TRAINER, status: 'active' });
    docs.set('trainerLinks/b', { trainerId: TRAINER, status: 'active' });
    const profile = await trainerService.getProfile(TRAINER);
    // stu-nut + a + b = 3 active links.
    expect(profile.totalStudents).toBe(3);
  });

  it('photos are gated by shareProgressWithTrainer', async () => {
    docs.set('users/stu-nut/profile/data', { name: 'Nina', shareProgressWithTrainer: false });
    const res = await trainerService.studentPhotos('stu-nut');
    expect(res).toEqual({ shared: false, photos: [] });
  });
});
