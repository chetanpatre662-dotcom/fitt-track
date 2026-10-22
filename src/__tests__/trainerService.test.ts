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
    // orderBy/limit are no-op passthroughs: ordering/paging is not asserted at
    // this level, but the repositories chain them after where().
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
        increment: (n: number) => increment(n),
      },
    },
  },
}));

import { trainerService } from '../services/trainerService.js';
import { studentService } from '../services/studentService.js';
import {
  trainerProfileSchema,
  trainerPreviewQuerySchema,
} from '../validators/trainerValidators.js';
import { dietPlanAssignmentService } from '../services/dietPlanAssignmentService.js';
import { assignedWorkoutService } from '../services/assignedWorkoutService.js';
import { assertTrainerOwnsStudent, assertTrainerOwnsPendingRequest } from '../middleware/role.js';
import { roleService } from '../services/roleService.js';

const TRAINER = 'trainer-1';

/** Seeds a trainer + its active referral-code index doc. */
function seedTrainer(id: string, name: string, code: string): void {
  const lower = code.toLowerCase();
  docs.set(`trainers/${id}`, {
    trainerId: id,
    name,
    referralCode: code,
    referralCodeLower: lower,
    status: 'active',
    active: true,
    totalStudents: 0,
  });
  docs.set(`referralCodes/${lower}`, { trainerId: id, code, active: true });
  docs.set(`users/${id}`, { role: 'trainer' });
}

beforeEach(() => {
  docs = new Map();
  seedTrainer(TRAINER, 'Alex Carter', 'FITCHE123');
});

describe('TrainerService.linkStudent', () => {
  it('links a valid code, creates the link, mirrors profile, increments once', async () => {
    const res = await trainerService.linkStudent('stu-1', 'FitChe123');
    expect(res.linked).toBe(true);
    expect(res.trainerId).toBe(TRAINER);
    expect(res.trainerName).toBe('Alex Carter');

    expect(docs.get('trainerLinks/stu-1')).toMatchObject({ trainerId: TRAINER, status: 'active' });
    expect(docs.get('users/stu-1/profile/data')).toMatchObject({ trainerId: TRAINER });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('normalizes case/whitespace in the referral code', async () => {
    const res = await trainerService.linkStudent('stu-2', '  FITCHE123  ');
    expect(res.linked).toBe(true);
    expect(docs.get('trainerLinks/stu-2')).toBeTruthy();
  });

  it('returns a soft failure (no link, no increment) for an invalid code', async () => {
    const res = await trainerService.linkStudent('stu-3', 'nope');
    expect(res).toEqual({ linked: false, reason: 'invalid_code' });
    expect(docs.has('trainerLinks/stu-3')).toBe(false);
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(0);
  });

  it('treats an inactive code as invalid', async () => {
    docs.set('referralCodes/fitche123', { trainerId: TRAINER, code: 'FITCHE123', active: false });
    const res = await trainerService.linkStudent('stu-x', 'FITCHE123');
    expect(res).toEqual({ linked: false, reason: 'invalid_code' });
  });

  it('is idempotent: re-linking the same trainer does not double count', async () => {
    await trainerService.linkStudent('stu-4', 'FITCHE123');
    const res = await trainerService.linkStudent('stu-4', 'FITCHE123');
    expect(res).toMatchObject({ linked: true, alreadyLinked: true });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('rejects a trainer account trying to link as a student (409)', async () => {
    docs.set('users/trainer-x', { role: 'trainer' });
    await expect(trainerService.linkStudent('trainer-x', 'FITCHE123')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('TrainerService.linkStudent one-active-trainer switch guard', () => {
  beforeEach(() => {
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
  });

  it('different trainer without confirm -> already_linked, NO write', async () => {
    await trainerService.linkStudent('stu-s', 'FITCHE123');
    const before = JSON.stringify(docs.get('trainerLinks/stu-s'));

    const res = await trainerService.linkStudent('stu-s', 'GYMRAHUL45');
    expect(res.linked).toBe(false);
    expect(res.reason).toBe('already_linked');
    expect(res.currentTrainer).toEqual({ trainerId: 'trainer-1', name: 'Alex Carter' });
    expect(res.requestedTrainer).toEqual({ trainerId: 'trainer-2', name: 'Bela Rao' });
    // Link untouched.
    expect(JSON.stringify(docs.get('trainerLinks/stu-s'))).toBe(before);
    expect(docs.get('trainerLinks/stu-s')).toMatchObject({ trainerId: 'trainer-1' });
  });

  it('confirmSwitch=true moves the link to B, no counter write, live counts A-1/B+1', async () => {
    await trainerService.linkStudent('stu-s', 'FITCHE123');
    const aCounterBefore = docs.get('trainers/trainer-1')?.totalStudents;
    const bCounterBefore = docs.get('trainers/trainer-2')?.totalStudents;

    const res = await trainerService.linkStudent('stu-s', 'GYMRAHUL45', { confirmSwitch: true });
    expect(res).toMatchObject({ linked: true, switched: true, trainerId: 'trainer-2' });
    expect(docs.get('trainerLinks/stu-s')).toMatchObject({ trainerId: 'trainer-2', status: 'active' });
    expect(docs.get('users/stu-s/profile/data')).toMatchObject({ trainerId: 'trainer-2' });

    // No stored-counter mutation by the switch.
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(aCounterBefore);
    expect(docs.get('trainers/trainer-2')?.totalStudents).toBe(bCounterBefore);

    // Live counts reflect the move.
    expect((await trainerService.getProfile('trainer-1')).totalStudents).toBe(0);
    expect((await trainerService.getProfile('trainer-2')).totalStudents).toBe(1);
  });

  it('tolerates a null current-trainer name when A was removed', async () => {
    await trainerService.linkStudent('stu-s', 'FITCHE123');
    docs.delete('trainers/trainer-1');
    docs.delete('users/trainer-1');

    const res = await trainerService.linkStudent('stu-s', 'GYMRAHUL45');
    expect(res.reason).toBe('already_linked');
    expect(res.currentTrainer).toEqual({ trainerId: 'trainer-1', name: null });
  });
});

describe('TrainerService.requestTrainer (pending flow)', () => {
  it('valid code creates a PENDING request: no profile mirror, no increment', async () => {
    const res = await trainerService.requestTrainer('stu-1', 'FitChe123');
    expect(res).toMatchObject({ ok: true, status: 'pending', trainerId: TRAINER });
    expect(res.trainerName).toBe('Alex Carter');

    expect(docs.get('trainerLinks/stu-1')).toMatchObject({ trainerId: TRAINER, status: 'pending' });
    // No access-granting side effects until approval.
    expect(docs.has('users/stu-1/profile/data')).toBe(false);
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(0);
  });

  it('normalizes case/whitespace in the referral code', async () => {
    const res = await trainerService.requestTrainer('stu-2', '  FITCHE123  ');
    expect(res.ok).toBe(true);
    expect(docs.get('trainerLinks/stu-2')).toMatchObject({ status: 'pending' });
  });

  it('soft-fails (no write) on an invalid code', async () => {
    const res = await trainerService.requestTrainer('stu-3', 'nope');
    expect(res).toEqual({ ok: false, reason: 'invalid_code' });
    expect(docs.has('trainerLinks/stu-3')).toBe(false);
  });

  it('treats an inactive code as invalid', async () => {
    docs.set('referralCodes/fitche123', { trainerId: TRAINER, code: 'FITCHE123', active: false });
    const res = await trainerService.requestTrainer('stu-x', 'FITCHE123');
    expect(res).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('rejects a trainer account trying to request a trainer (409)', async () => {
    docs.set('users/trainer-x', { role: 'trainer' });
    await expect(trainerService.requestTrainer('trainer-x', 'FITCHE123')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('is idempotent: a duplicate pending request to the same trainer does not re-write', async () => {
    await trainerService.requestTrainer('stu-4', 'FITCHE123');
    docs.set('trainerLinks/stu-4', { trainerId: TRAINER, status: 'pending', marker: 1 });
    const res = await trainerService.requestTrainer('stu-4', 'FITCHE123');
    expect(res).toMatchObject({ ok: true, status: 'pending', trainerId: TRAINER });
    // Untouched (our marker survives -> no write happened).
    expect(docs.get('trainerLinks/stu-4')).toMatchObject({ marker: 1 });
  });

  it('is idempotent when already ACTIVE with the same trainer (no downgrade)', async () => {
    docs.set('trainerLinks/stu-5', { trainerId: TRAINER, status: 'active' });
    const res = await trainerService.requestTrainer('stu-5', 'FITCHE123');
    expect(res).toMatchObject({ ok: true, status: 'active', trainerId: TRAINER });
    expect(docs.get('trainerLinks/stu-5')).toMatchObject({ status: 'active' });
  });

  it('already ACTIVE with a different trainer -> already_linked, NO write', async () => {
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
    docs.set('trainerLinks/stu-s', { trainerId: 'trainer-1', status: 'active' });
    const before = JSON.stringify(docs.get('trainerLinks/stu-s'));

    const res = await trainerService.requestTrainer('stu-s', 'GYMRAHUL45');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('already_linked');
    expect(res.currentTrainer).toEqual({ trainerId: 'trainer-1', name: 'Alex Carter' });
    expect(res.requestedTrainer).toEqual({ trainerId: 'trainer-2', name: 'Bela Rao' });
    expect(JSON.stringify(docs.get('trainerLinks/stu-s'))).toBe(before);
  });

  it('a pending request to a different trainer re-points the link to pending', async () => {
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
    docs.set('trainerLinks/stu-p', { trainerId: 'trainer-1', status: 'pending' });
    const res = await trainerService.requestTrainer('stu-p', 'GYMRAHUL45');
    expect(res).toMatchObject({ ok: true, status: 'pending', trainerId: 'trainer-2' });
    expect(docs.get('trainerLinks/stu-p')).toMatchObject({ trainerId: 'trainer-2', status: 'pending' });
  });
});

describe('TrainerService.approveRequest / rejectRequest', () => {
  beforeEach(() => {
    docs.set('trainerLinks/stu-req', { trainerId: TRAINER, status: 'pending' });
    docs.set('users/stu-req/profile/data', { name: 'Nina' });
  });

  it('approve: pending -> active, mirrors trainerId + trainerStatus, +1 count once', async () => {
    const res = await trainerService.approveRequest(TRAINER, 'stu-req');
    expect(res).toMatchObject({ ok: true, status: 'active', studentUid: 'stu-req' });
    expect(docs.get('trainerLinks/stu-req')).toMatchObject({ trainerId: TRAINER, status: 'active' });
    expect(docs.get('users/stu-req/profile/data')).toMatchObject({
      trainerId: TRAINER,
      trainerStatus: 'approved',
    });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('approve throws 404 for a non-owning trainer', async () => {
    await expect(trainerService.approveRequest('trainer-2', 'stu-req')).rejects.toMatchObject({
      statusCode: 404,
    });
    // No side effects.
    expect(docs.get('trainerLinks/stu-req')).toMatchObject({ status: 'pending' });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(0);
  });

  it('approve throws 404 for a non-pending (already active) link', async () => {
    docs.set('trainerLinks/stu-req', { trainerId: TRAINER, status: 'active' });
    await expect(trainerService.approveRequest(TRAINER, 'stu-req')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('double-approve does NOT double-count: 2nd approve rejects 404 and leaves totalStudents at 1', async () => {
    const first = await trainerService.approveRequest(TRAINER, 'stu-req');
    expect(first).toMatchObject({ ok: true, status: 'active' });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
    // A second approve of the now-active link must throw and not increment again.
    await expect(trainerService.approveRequest(TRAINER, 'stu-req')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(1);
  });

  it('reject: pending -> rejected, no mirror, no count change', async () => {
    const res = await trainerService.rejectRequest(TRAINER, 'stu-req');
    expect(res).toMatchObject({ ok: true, status: 'rejected', studentUid: 'stu-req' });
    expect(docs.get('trainerLinks/stu-req')).toMatchObject({ status: 'rejected' });
    expect(docs.has('users/stu-req/profile/data') && docs.get('users/stu-req/profile/data')?.trainerId).toBeFalsy();
    expect(docs.get('trainers/trainer-1')?.totalStudents).toBe(0);
  });

  it('reject throws 404 for a non-owning trainer', async () => {
    await expect(trainerService.rejectRequest('trainer-2', 'stu-req')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('TrainerService.listRequestsForTrainer', () => {
  it('returns only pending requests, enriched with name + photoUrl', async () => {
    docs.set('trainerLinks/p1', { trainerId: TRAINER, status: 'pending', updatedAt: '2026-01-02T00:00:00Z' });
    docs.set('trainerLinks/p2', { trainerId: TRAINER, status: 'pending', updatedAt: '2026-01-03T00:00:00Z' });
    docs.set('trainerLinks/active1', { trainerId: TRAINER, status: 'active' });
    docs.set('trainerLinks/otherpending', { trainerId: 'trainer-2', status: 'pending' });
    docs.set('users/p1/profile/data', { name: 'Pat', photoUrl: 'http://img/p1' });
    docs.set('users/p2/profile/data', { name: 'Quinn', photoUrl: null });

    const requests = await trainerService.listRequestsForTrainer(TRAINER);
    expect(requests.map((r) => r.studentUid)).toEqual(['p2', 'p1']); // newest first
    expect(requests[1]).toMatchObject({ studentUid: 'p1', name: 'Pat', photoUrl: 'http://img/p1' });
    // Active + other-trainer pending excluded.
    expect(requests.find((r) => r.studentUid === 'active1')).toBeUndefined();
    expect(requests.find((r) => r.studentUid === 'otherpending')).toBeUndefined();
  });

  it('tolerates a missing profile (name/photo null)', async () => {
    docs.set('trainerLinks/p3', { trainerId: TRAINER, status: 'pending' });
    const requests = await trainerService.listRequestsForTrainer(TRAINER);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ studentUid: 'p3', name: null, photoUrl: null });
  });
});

describe('assertTrainerOwnsPendingRequest', () => {
  beforeEach(() => {
    docs.set('trainerLinks/pend', { trainerId: TRAINER, status: 'pending' });
    docs.set('trainerLinks/act', { trainerId: TRAINER, status: 'active' });
    docs.set('trainerLinks/otherpend', { trainerId: 'trainer-2', status: 'pending' });
  });

  it('passes for an owned pending request', async () => {
    await expect(assertTrainerOwnsPendingRequest(TRAINER, 'pend')).resolves.toBeUndefined();
  });

  it('throws 404 for an active (non-pending) link', async () => {
    await expect(assertTrainerOwnsPendingRequest(TRAINER, 'act')).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 for another trainer's pending request", async () => {
    await expect(assertTrainerOwnsPendingRequest(TRAINER, 'otherpend')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 for a missing link', async () => {
    await expect(assertTrainerOwnsPendingRequest(TRAINER, 'ghost')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('TrainerService referral-code lifecycle', () => {
  const fixedCode = (c: string) => () => {
    let i = 0;
    const seq = c.split('');
    return () => {
      const ch = seq[i % seq.length];
      i += 1;
      return ch.charCodeAt(0) % 10;
    };
  };

  it('claimReferralCode: first claim succeeds, other trainer blocked, same trainer no-op', async () => {
    // First custom claim for trainer-1.
    const saved = await trainerService.setCustomReferralCode(TRAINER, 'AlphaOne');
    expect(saved).toBe('AlphaOne');
    expect(docs.get('referralCodes/alphaone')).toMatchObject({ trainerId: TRAINER, active: true });
    expect(docs.get('trainers/trainer-1')).toMatchObject({
      referralCode: 'AlphaOne',
      referralCodeLower: 'alphaone',
    });
    // Old code deactivated (not deleted).
    expect(docs.get('referralCodes/fitche123')).toMatchObject({ active: false });

    // A different trainer cannot claim AlphaOne -> 409.
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
    await expect(trainerService.setCustomReferralCode('trainer-2', 'AlphaOne')).rejects.toMatchObject({
      statusCode: 409,
    });

    // Same trainer re-claiming their own current code is a no-op success.
    const again = await trainerService.setCustomReferralCode(TRAINER, 'AlphaOne');
    expect(again).toBe('AlphaOne');
  });

  it('setCustomReferralCode leaves trainerLinks untouched', async () => {
    docs.set('trainerLinks/stu-1', { trainerId: TRAINER, status: 'active' });
    const before = JSON.stringify(docs.get('trainerLinks/stu-1'));
    await trainerService.setCustomReferralCode(TRAINER, 'BrandNew9');
    expect(JSON.stringify(docs.get('trainerLinks/stu-1'))).toBe(before);
  });

  it('generateReferralCode: new code active, old deactivated, trainer updated, links untouched', async () => {
    docs.set('trainerLinks/stu-1', { trainerId: TRAINER, status: 'active' });
    const linkBefore = JSON.stringify(docs.get('trainerLinks/stu-1'));

    const code = await trainerService.generateReferralCode(TRAINER);
    expect(code).not.toBe('FITCHE123');
    expect(docs.get(`referralCodes/${code.toLowerCase()}`)).toMatchObject({
      trainerId: TRAINER,
      active: true,
    });
    expect(docs.get('referralCodes/fitche123')).toMatchObject({ active: false });
    expect(docs.get('trainers/trainer-1')).toMatchObject({ referralCode: code });
    expect(JSON.stringify(docs.get('trainerLinks/stu-1'))).toBe(linkBefore);
  });

  it('generate retries past a collision and leaves the colliding code untouched', async () => {
    // Pre-create a code owned by another trainer that the first candidate hits.
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
    const takenLower = 'fitaaaa';
    docs.set(`referralCodes/${takenLower}`, { trainerId: 'trainer-2', code: 'FITAAAA', active: true });
    const takenBefore = JSON.stringify(docs.get(`referralCodes/${takenLower}`));

    // RNG forces the FIRST candidate to be FITAAAA (collision), then a real one.
    let call = 0;
    const rng = (max: number): number => {
      call += 1;
      // calls 1..5 build the first candidate FIT + AAAA (indices 0).
      if (call <= 5) return 0;
      // subsequent candidate: prefix index 1 (TRN) then non-zero suffix.
      if (call === 6) return 1;
      return 2;
    };
    const code = await trainerService.generateReferralCode(TRAINER, rng);
    expect(code).not.toBe('FITAAAA');
    // The colliding (other trainer's) code is untouched by the aborted attempt.
    expect(JSON.stringify(docs.get(`referralCodes/${takenLower}`))).toBe(takenBefore);
    // Our old code is deactivated by the successful attempt only.
    expect(docs.get('referralCodes/fitche123')).toMatchObject({ active: false });
  });

  it('checkAvailability: available / taken-by-other / reserved / invalid', async () => {
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');

    expect(await trainerService.checkAvailability('FreshCode', TRAINER)).toEqual({ available: true });
    // Owned by another trainer -> taken.
    expect(await trainerService.checkAvailability('GYMRAHUL45', TRAINER)).toEqual({
      available: false,
      reason: 'taken',
    });
    // The trainer's own code is available to themselves.
    expect(await trainerService.checkAvailability('FITCHE123', TRAINER)).toEqual({ available: true });
    // Reserved word.
    expect(await trainerService.checkAvailability('dreamphysics', TRAINER)).toEqual({
      available: false,
      reason: 'reserved',
    });
    // Invalid format (too short / symbol).
    expect(await trainerService.checkAvailability('a b', TRAINER)).toEqual({
      available: false,
      reason: 'invalid',
    });
  });

  it('taken-by-other is unavailable even when the other trainer deactivated it', async () => {
    seedTrainer('trainer-2', 'Bela Rao', 'GYMRAHUL45');
    docs.set('referralCodes/gymrahul45', { trainerId: 'trainer-2', code: 'GYMRAHUL45', active: false });
    expect(await trainerService.checkAvailability('GYMRAHUL45', TRAINER)).toEqual({
      available: false,
      reason: 'taken',
    });
  });

  it('ensureTrainerAccount is idempotent: no duplicate trainer or second code', async () => {
    const first = await trainerService.ensureTrainerAccount('new-trainer', { name: 'Coach Zoe' });
    expect(first.trainerId).toBe('new-trainer');
    expect(first.referralCode).toBeTruthy();
    expect(docs.get('users/new-trainer')).toMatchObject({ role: 'trainer' });
    expect(docs.get('trainers/new-trainer')).toMatchObject({ status: 'active', active: true });

    const second = await trainerService.ensureTrainerAccount('new-trainer', { name: 'Coach Zoe' });
    expect(second.referralCode).toBe(first.referralCode);
    void fixedCode; // reserved for future deterministic use
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

  it('resolves an unknown uid to user', async () => {
    expect(await roleService.resolveRole('nobody')).toBe('user');
  });

  it('resolves a uid with a non-terminal trainerLink to student', async () => {
    docs.set('trainerLinks/stu-x', { trainerId: TRAINER, status: 'active' });
    expect(await roleService.resolveRole('stu-x')).toBe('student');
  });

  it('resolves a uid with a terminal (rejected) trainerLink to user, not student', async () => {
    docs.set('trainerLinks/stu-r', { trainerId: TRAINER, status: 'rejected' });
    expect(await roleService.resolveRole('stu-r')).toBe('user');
  });
});

describe('TrainerService trainer-reads-student round trips', () => {
  beforeEach(() => {
    docs.set('trainerLinks/stu-nut', { trainerId: TRAINER, status: 'active', createdAt: SERVER_TS });
    docs.set('users/stu-nut/profile/data', {
      name: 'Nina',
      goals: ['lose_weight'],
      weightKg: 60,
      shareProgressWithTrainer: true,
      // Granular sharing: enable every category so the round-trips below read
      // real data (sharing is now per-category, not a single boolean).
      trainerSharing: {
        workoutHistory: true,
        nutrition: true,
        measurements: true,
        progressPhotos: true,
        progressReports: true,
      },
    });
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

describe('StudentService.getTrainer (My Trainer card)', () => {
  it('returns {trainer:null} when there is no link', async () => {
    expect(await studentService.getTrainer('stu-none')).toEqual({ trainer: null });
  });

  it('surfaces an APPROVED (active) link with the connected code read-only', async () => {
    docs.set('trainerLinks/stu-ok', { trainerId: TRAINER, status: 'active' });
    const res = await studentService.getTrainer('stu-ok');
    expect(res.trainer).toMatchObject({
      trainerId: TRAINER,
      name: 'Alex Carter',
      referralCode: 'FITCHE123',
      associationStatus: 'active',
    });
  });

  it('surfaces a PENDING request WITHOUT exposing the Trainer Code yet', async () => {
    docs.set('trainerLinks/stu-pend', { trainerId: TRAINER, status: 'pending' });
    const res = await studentService.getTrainer('stu-pend');
    expect(res.trainer).toMatchObject({
      trainerId: TRAINER,
      name: 'Alex Carter',
      associationStatus: 'pending',
    });
    // No code is leaked until the request is approved.
    expect(res.trainer?.referralCode).toBeNull();
  });

  it('surfaces a REJECTED link WITHOUT exposing the Trainer Code (so the student is told it was declined)', async () => {
    docs.set('trainerLinks/stu-rej', { trainerId: TRAINER, status: 'rejected' });
    const res = await studentService.getTrainer('stu-rej');
    expect(res.trainer).toMatchObject({
      trainerId: TRAINER,
      name: 'Alex Carter',
      associationStatus: 'rejected',
    });
    // A declined request never exposes the Trainer Code.
    expect(res.trainer?.referralCode).toBeNull();
  });

  it('treats an inactive link as no trainer', async () => {
    docs.set('trainerLinks/stu-inact', { trainerId: TRAINER, status: 'inactive' });
    expect(await studentService.getTrainer('stu-inact')).toEqual({ trainer: null });
  });

  it('returns an always-present five-key sharing object (defaults all false when unset)', async () => {
    docs.set('trainerLinks/stu-ok', { trainerId: TRAINER, status: 'active' });
    const res = await studentService.getTrainer('stu-ok');
    expect(res.trainer?.sharing).toEqual({
      workoutHistory: false,
      nutrition: false,
      measurements: false,
      progressPhotos: false,
      progressReports: false,
    });
  });

  it('maps the legacy shareProgressWithTrainer flag onto progressPhotos in the sharing object', async () => {
    docs.set('trainerLinks/stu-ok', { trainerId: TRAINER, status: 'active' });
    docs.set('users/stu-ok/profile/data', { shareProgressWithTrainer: true });
    const res = await studentService.getTrainer('stu-ok');
    expect(res.trainer?.sharing).toMatchObject({ progressPhotos: true, nutrition: false });
  });

  it('omits experience/bio when absent on the trainer doc and surfaces them when present', async () => {
    docs.set('trainerLinks/stu-a', { trainerId: TRAINER, status: 'active' });
    const absent = await studentService.getTrainer('stu-a');
    expect(absent.trainer).not.toHaveProperty('experience');
    expect(absent.trainer).not.toHaveProperty('bio');

    docs.set('trainers/trainer-1', {
      ...(docs.get('trainers/trainer-1') as Record<string, unknown>),
      experience: '5 years',
      bio: 'Strength coach',
    });
    const present = await studentService.getTrainer('stu-a');
    expect(present.trainer).toMatchObject({ experience: '5 years', bio: 'Strength coach' });
  });

  it('surfaces public youtubeUrl/instagramUrl only when present', async () => {
    docs.set('trainerLinks/stu-s', { trainerId: TRAINER, status: 'active' });
    const absent = await studentService.getTrainer('stu-s');
    expect(absent.trainer).not.toHaveProperty('youtubeUrl');
    expect(absent.trainer).not.toHaveProperty('instagramUrl');

    docs.set('trainers/trainer-1', {
      ...(docs.get('trainers/trainer-1') as Record<string, unknown>),
      youtubeUrl: 'https://youtube.com/@coach',
      instagramUrl: 'https://instagram.com/coach',
    });
    const present = await studentService.getTrainer('stu-s');
    expect(present.trainer).toMatchObject({
      youtubeUrl: 'https://youtube.com/@coach',
      instagramUrl: 'https://instagram.com/coach',
    });
  });

  it('NEVER leaks private trainer fields even when present on the doc (HIGH-3)', async () => {
    docs.set('trainerLinks/stu-priv', { trainerId: TRAINER, status: 'active' });
    // A trainer doc carrying ALL private fields plus public ones.
    docs.set('trainers/trainer-1', {
      ...(docs.get('trainers/trainer-1') as Record<string, unknown>),
      mobile: '+1 555 0100',
      dateOfBirth: '1990-05-01',
      heightCm: 182,
      weightKg: 80,
      email: 'coach@example.com',
      experience: '5 years',
      youtubeUrl: 'https://youtube.com/@coach',
      instagramUrl: 'https://instagram.com/coach',
    });
    const res = await studentService.getTrainer('stu-priv');
    const card = res.trainer as Record<string, unknown>;
    // The student-facing card is a strict allow-list: none of the five private
    // keys may ever appear, even though they exist on the doc.
    for (const key of ['mobile', 'dateOfBirth', 'heightCm', 'weightKg', 'email']) {
      expect(card).not.toHaveProperty(key);
    }
    // Public fields still flow.
    expect(card).toMatchObject({
      experience: '5 years',
      youtubeUrl: 'https://youtube.com/@coach',
      instagramUrl: 'https://instagram.com/coach',
    });
  });
});

describe('TrainerService.updateTrainerProfile (PATCH /api/trainer/profile)', () => {
  it('sets profileCompleted=true when all required fields are present/valid', async () => {
    const result = await trainerService.updateTrainerProfile(TRAINER, {
      name: 'Alex Carter',
      mobile: '+1 555 0100',
      dateOfBirth: '1990-05-01',
      heightCm: 182,
      weightKg: 80,
      experience: '5 years',
      bio: 'Strength coach',
      youtubeUrl: 'https://youtube.com/@coach',
      instagramUrl: 'https://instagram.com/coach',
    });
    expect(result.profileCompleted).toBe(true);
    const stored = docs.get('trainers/trainer-1') as Record<string, unknown>;
    expect(stored).toMatchObject({
      mobile: '+1 555 0100',
      heightCm: 182,
      role: 'trainer',
      profileCompleted: true,
    });
    // Identity + public read path preserved.
    expect(stored.trainerId).toBe(TRAINER);
  });

  it('leaves profileCompleted=false on a partial patch missing a required field', async () => {
    const result = await trainerService.updateTrainerProfile(TRAINER, {
      bio: 'Just a bio edit',
    });
    expect(result.profileCompleted).toBe(false);
    // The patched field is written without clobbering identity.
    expect((docs.get('trainers/trainer-1') as Record<string, unknown>).bio).toBe(
      'Just a bio edit',
    );
  });

  it('stores a cleared social URL as null so the student projection omits it', async () => {
    // Seed a stored link, then clear youtube with an empty string.
    docs.set('trainerLinks/stu-clear', { trainerId: TRAINER, status: 'active' });
    await trainerService.updateTrainerProfile(TRAINER, {
      youtubeUrl: '  ',
      instagramUrl: 'https://instagram.com/coach',
    });
    const stored = docs.get('trainers/trainer-1') as Record<string, unknown>;
    // Cleared -> null (not an empty string) so the conditional-append omits it.
    expect(stored.youtubeUrl).toBeNull();
    expect(stored.instagramUrl).toBe('https://instagram.com/coach');

    const card = (await studentService.getTrainer('stu-clear')).trainer;
    expect(card).not.toHaveProperty('youtubeUrl');
    expect(card).toMatchObject({ instagramUrl: 'https://instagram.com/coach' });
  });

  it('computes completeness from the MERGED doc (stored + patch)', async () => {
    // First save the required set except experience.
    await trainerService.updateTrainerProfile(TRAINER, {
      name: 'Alex Carter',
      mobile: '+1 555 0100',
      dateOfBirth: '1990-05-01',
      heightCm: 182,
      weightKg: 80,
    });
    expect((docs.get('trainers/trainer-1') as Record<string, unknown>).profileCompleted).toBe(
      false,
    );
    // A later patch that only adds experience flips completeness to true.
    const result = await trainerService.updateTrainerProfile(TRAINER, {
      experience: '5 years',
    });
    expect(result.profileCompleted).toBe(true);
  });
});

describe('StudentService.previewByCode (public-by-code preview)', () => {
  it('returns found:true + PUBLIC fields for a valid active code', async () => {
    docs.set('trainers/trainer-1', {
      ...(docs.get('trainers/trainer-1') as Record<string, unknown>),
      experience: '5 years',
      youtubeUrl: 'https://youtube.com/@coach',
      // Private fields present on the doc must NOT be surfaced.
      mobile: '+1 555 0100',
      heightCm: 182,
      email: 'coach@example.com',
    });
    const res = await studentService.previewByCode('FITCHE123');
    expect(res.found).toBe(true);
    expect(res.trainer).toMatchObject({
      name: 'Alex Carter',
      experience: '5 years',
      youtubeUrl: 'https://youtube.com/@coach',
    });
    for (const key of ['mobile', 'dateOfBirth', 'heightCm', 'weightKg', 'email']) {
      expect(res.trainer).not.toHaveProperty(key);
    }
  });

  it('returns found:false for an unknown code (anti-enumeration)', async () => {
    expect(await studentService.previewByCode('nope123')).toEqual({ found: false });
  });

  it('returns found:false for an inactive code', async () => {
    docs.set('referralCodes/fitche123', {
      trainerId: TRAINER,
      code: 'FITCHE123',
      active: false,
    });
    expect(await studentService.previewByCode('FITCHE123')).toEqual({ found: false });
  });

  it('omits optional public fields when absent (name always present)', async () => {
    const res = await studentService.previewByCode('FITCHE123');
    expect(res.found).toBe(true);
    expect(res.trainer).toHaveProperty('name');
    expect(res.trainer).not.toHaveProperty('experience');
    expect(res.trainer).not.toHaveProperty('youtubeUrl');
  });
});

describe('trainerProfileSchema validation', () => {
  const valid = {
    name: 'Alex',
    mobile: '+1 555 0100',
    dateOfBirth: '1990-05-01',
    heightCm: 182,
    weightKg: 80,
    experience: '5 years',
    bio: 'Strength coach',
    youtubeUrl: 'https://youtube.com/@coach',
    instagramUrl: 'https://instagram.com/coach',
  };

  it('accepts a complete valid patch', () => {
    expect(trainerProfileSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a partial patch (single field)', () => {
    expect(trainerProfileSchema.safeParse({ bio: 'x' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(trainerProfileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a malformed mobile', () => {
    expect(
      trainerProfileSchema.safeParse({ ...valid, mobile: 'abc' }).success,
    ).toBe(false);
  });

  it('rejects a future / underage date of birth', () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    expect(
      trainerProfileSchema.safeParse({ ...valid, dateOfBirth: `${nextYear}-01-01` })
        .success,
    ).toBe(false);
    const recent = new Date().getUTCFullYear() - 5;
    expect(
      trainerProfileSchema.safeParse({ ...valid, dateOfBirth: `${recent}-01-01` })
        .success,
    ).toBe(false);
  });

  it('rejects out-of-range height/weight', () => {
    expect(
      trainerProfileSchema.safeParse({ ...valid, heightCm: 10 }).success,
    ).toBe(false);
    expect(
      trainerProfileSchema.safeParse({ ...valid, weightKg: 1000 }).success,
    ).toBe(false);
  });

  it('rejects a non-https social URL but accepts empty string', () => {
    expect(
      trainerProfileSchema.safeParse({ ...valid, youtubeUrl: 'http://youtube.com/x' })
        .success,
    ).toBe(false);
    expect(
      trainerProfileSchema.safeParse({ ...valid, instagramUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
    expect(
      trainerProfileSchema.safeParse({ ...valid, youtubeUrl: '' }).success,
    ).toBe(true);
  });

  it('rejects unknown keys (.strict)', () => {
    expect(
      trainerProfileSchema.safeParse({ ...valid, hacker: true }).success,
    ).toBe(false);
  });
});

describe('trainerPreviewQuerySchema validation', () => {
  it('trims + lowercases a well-formed code', () => {
    const parsed = trainerPreviewQuerySchema.parse({ code: '  FitChe123  ' });
    expect(parsed.code).toBe('fitche123');
  });

  it('rejects a too-short code', () => {
    expect(trainerPreviewQuerySchema.safeParse({ code: 'ab' }).success).toBe(false);
  });
});

describe('TrainerService per-category sharing gate (isShared via loaders)', () => {
  beforeEach(() => {
    docs.set('trainerLinks/stu-share', { trainerId: TRAINER, status: 'active' });
  });

  it('map present: each category gates ONLY its own loaders', async () => {
    docs.set('users/stu-share/profile/data', {
      trainerSharing: {
        workoutHistory: true,
        nutrition: false,
        measurements: false,
        progressPhotos: false,
        progressReports: false,
      },
    });
    expect((await trainerService.studentWorkoutsForDate('stu-share', '2026-01-01')).shared).toBe(true);
    expect((await trainerService.studentWorkoutHistory('stu-share')).shared).toBe(true);
    expect((await trainerService.studentNutrition('stu-share', '2026-01-01')).shared).toBe(false);
    expect((await trainerService.studentWater('stu-share', '2026-01-01')).shared).toBe(false);
    expect((await trainerService.studentMeasurements('stu-share')).shared).toBe(false);
    expect((await trainerService.studentPhotos('stu-share')).shared).toBe(false);
    expect((await trainerService.studentProgress('stu-share')).shared).toBe(false);
    expect((await trainerService.studentRecords('stu-share')).shared).toBe(false);
  });

  it('map absent + legacy true -> ONLY progressPhotos shared, everything else false', async () => {
    docs.set('users/stu-share/profile/data', { shareProgressWithTrainer: true });
    expect((await trainerService.studentPhotos('stu-share')).shared).toBe(true);
    expect((await trainerService.studentWorkoutHistory('stu-share')).shared).toBe(false);
    expect((await trainerService.studentNutrition('stu-share', '2026-01-01')).shared).toBe(false);
    expect((await trainerService.studentMeasurements('stu-share')).shared).toBe(false);
    expect((await trainerService.studentProgress('stu-share')).shared).toBe(false);
    expect((await trainerService.studentRecords('stu-share')).shared).toBe(false);
  });

  it('map absent + no legacy flag -> all categories false', async () => {
    docs.set('users/stu-share/profile/data', { name: 'No Sharing' });
    expect((await trainerService.studentPhotos('stu-share')).shared).toBe(false);
    expect((await trainerService.studentWorkoutHistory('stu-share')).shared).toBe(false);
    expect((await trainerService.studentNutrition('stu-share', '2026-01-01')).shared).toBe(false);
    expect((await trainerService.studentMeasurements('stu-share')).shared).toBe(false);
    expect((await trainerService.studentProgress('stu-share')).shared).toBe(false);
    expect((await trainerService.studentRecords('stu-share')).shared).toBe(false);
  });

  it('an explicit granular false overrides a legacy true for progressPhotos', async () => {
    docs.set('users/stu-share/profile/data', {
      shareProgressWithTrainer: true,
      trainerSharing: { progressPhotos: false },
    });
    expect((await trainerService.studentPhotos('stu-share')).shared).toBe(false);
  });
});

describe('TrainerService.studentOverview body-metric gate (measurements)', () => {
  /** A full profile with body metrics + a derived targets object. */
  function seedProfile(sharing?: Record<string, boolean>, legacy?: boolean): void {
    docs.set('users/stu-ov/profile/data', {
      name: 'Nina',
      photoUrl: 'http://img/nina',
      goals: ['lose_weight'],
      activityLevel: 'moderate',
      workoutDaysPerWeek: 4,
      preferredWorkoutTime: 'morning',
      // Body metrics + their derivative targets (gated behind measurements).
      weightKg: 60,
      heightCm: 170,
      dateOfBirth: '1995-05-01T00:00:00.000Z',
      ageYears: 30,
      gender: 'female',
      targets: { calories: 1800, protein: 120, carbs: 180, fat: 60 },
      // Non-allowlisted keys that must NEVER be forwarded.
      units: 'metric',
      fitnessLevel: 'intermediate',
      ...(sharing ? { trainerSharing: sharing } : {}),
      ...(legacy !== undefined ? { shareProgressWithTrainer: legacy } : {}),
    });
    docs.set('trainerLinks/stu-ov', { trainerId: TRAINER, status: 'active', createdAt: SERVER_TS });
  }

  it('measurements ON -> body metrics + targets present, measurementsShared true', async () => {
    seedProfile({ measurements: true });
    const res = await trainerService.studentOverview('stu-ov');
    expect(res.measurementsShared).toBe(true);
    const profile = res.profile as Record<string, unknown>;
    expect(profile).toMatchObject({
      weightKg: 60,
      heightCm: 170,
      dateOfBirth: '1995-05-01T00:00:00.000Z',
      ageYears: 30,
      gender: 'female',
    });
    expect(profile).toHaveProperty('targets');
    // Always-present coaching context is there too.
    expect(profile).toMatchObject({
      name: 'Nina',
      photoUrl: 'http://img/nina',
      activityLevel: 'moderate',
      workoutDaysPerWeek: 4,
      preferredWorkoutTime: 'morning',
    });
    expect(profile.goals).toEqual(['lose_weight']);
  });

  it('measurements OFF -> body metrics + targets ABSENT, allowlist drops private keys', async () => {
    seedProfile({ measurements: false });
    const res = await trainerService.studentOverview('stu-ov');
    expect(res.measurementsShared).toBe(false);
    const profile = res.profile as Record<string, unknown>;
    // Gated body metrics + derived targets are absent (not on the wire).
    expect(profile).not.toHaveProperty('weightKg');
    expect(profile).not.toHaveProperty('heightCm');
    expect(profile).not.toHaveProperty('dateOfBirth');
    expect(profile).not.toHaveProperty('ageYears');
    expect(profile).not.toHaveProperty('gender');
    expect(profile).not.toHaveProperty('targets');
    // Non-allowlisted keys are never forwarded.
    expect(profile).not.toHaveProperty('units');
    expect(profile).not.toHaveProperty('fitnessLevel');
    expect(profile).not.toHaveProperty('trainerSharing');
    expect(profile).not.toHaveProperty('shareProgressWithTrainer');
    // Always-present coaching context survives.
    expect(profile).toMatchObject({
      name: 'Nina',
      photoUrl: 'http://img/nina',
      activityLevel: 'moderate',
      workoutDaysPerWeek: 4,
      preferredWorkoutTime: 'morning',
    });
  });

  it('sharing map entirely absent -> body metrics + targets hidden (fail-closed)', async () => {
    seedProfile();
    const res = await trainerService.studentOverview('stu-ov');
    expect(res.measurementsShared).toBe(false);
    const profile = res.profile as Record<string, unknown>;
    expect(profile).not.toHaveProperty('weightKg');
    expect(profile).not.toHaveProperty('targets');
    expect(profile).toMatchObject({ name: 'Nina' });
  });

  it('legacy-only profile (shareProgressWithTrainer true, no granular map) -> body metrics + targets hidden', async () => {
    seedProfile(undefined, true);
    const res = await trainerService.studentOverview('stu-ov');
    // measurements is not covered by the legacy flag (only progressPhotos is).
    expect(res.measurementsShared).toBe(false);
    const profile = res.profile as Record<string, unknown>;
    expect(profile).not.toHaveProperty('weightKg');
    expect(profile).not.toHaveProperty('targets');
    expect(profile).toMatchObject({ name: 'Nina', photoUrl: 'http://img/nina' });
  });

  it('no profile -> profile null, measurementsShared false', async () => {
    docs.set('trainerLinks/stu-np', { trainerId: TRAINER, status: 'active', createdAt: SERVER_TS });
    const res = await trainerService.studentOverview('stu-np');
    expect(res.profile).toBeNull();
    expect(res.measurementsShared).toBe(false);
    expect(res.trainerAssociation).toMatchObject({ trainerId: TRAINER, status: 'active' });
  });
});

describe('StudentService.setSharing (granular)', () => {
  it('merges a one-key patch into an empty map and resolves all five keys', async () => {
    const result = await studentService.setSharing('stu-set', { nutrition: true });
    expect(result).toEqual({
      workoutHistory: false,
      nutrition: true,
      measurements: false,
      progressPhotos: false,
      progressReports: false,
    });
    expect((docs.get('users/stu-set/profile/data') as Record<string, unknown>).trainerSharing)
      .toMatchObject({ nutrition: true });
  });

  it('mirrors progressPhotos onto the legacy shareProgressWithTrainer boolean', async () => {
    await studentService.setSharing('stu-set', { progressPhotos: true });
    const profile = docs.get('users/stu-set/profile/data') as Record<string, unknown>;
    expect(profile.shareProgressWithTrainer).toBe(true);
    const off = await studentService.setSharing('stu-set', { progressPhotos: false });
    expect(off.progressPhotos).toBe(false);
    expect((docs.get('users/stu-set/profile/data') as Record<string, unknown>).shareProgressWithTrainer).toBe(false);
  });

  it('preserves previously-set categories when patching a different one', async () => {
    await studentService.setSharing('stu-set', { measurements: true });
    const result = await studentService.setSharing('stu-set', { workoutHistory: true });
    expect(result).toMatchObject({ measurements: true, workoutHistory: true });
  });
});

// --- FEAT-002: diet-plan assignment service ---------------------------------
describe('DietPlanAssignmentService', () => {
  it('assigns a text plan and stores trainerId + text at dietPlans/{studentUid}', async () => {
    const result = await dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', {
      text: 'Breakfast: oats',
    });
    expect(result.text).toBe('Breakfast: oats');
    expect(result.imageUrl).toBeNull();
    expect(docs.get('dietPlans/stu-dp')).toMatchObject({
      trainerId: TRAINER,
      studentUid: 'stu-dp',
      text: 'Breakfast: oats',
      imageStoragePath: null,
    });
  });

  it('signs an image URL when an owned storage path is assigned', async () => {
    const result = await dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', {
      imageStoragePath: `users/${TRAINER}/dietPlans/stu-dp/img.jpg`,
    });
    expect(result.imageUrl).toBe('https://signed.example/x');
    expect(result.text).toBeNull();
  });

  it('rejects a storage path outside the trainer prefix (400)', async () => {
    await expect(
      dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', {
        imageStoragePath: 'users/someone-else/dietPlans/stu-dp/img.jpg',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(docs.has('dietPlans/stu-dp')).toBe(false);
  });

  it("rejects a storage path containing '..' (400)", async () => {
    await expect(
      dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', {
        imageStoragePath: `users/${TRAINER}/dietPlans/stu-dp/../x.jpg`,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('replaces a prior plan on re-assignment', async () => {
    await dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', { text: 'v1' });
    const v2 = await dietPlanAssignmentService.assignForStudent(TRAINER, 'stu-dp', { text: 'v2' });
    expect(v2.text).toBe('v2');
    expect(docs.get('dietPlans/stu-dp')).toMatchObject({ text: 'v2' });
  });

  it('getForStudent returns the plan only for the active trainer', async () => {
    docs.set('trainerLinks/stu-dp', { trainerId: TRAINER, status: 'active' });
    docs.set('dietPlans/stu-dp', { trainerId: TRAINER, studentUid: 'stu-dp', text: 'active plan' });
    const plan = await dietPlanAssignmentService.getForStudent('stu-dp');
    expect(plan?.text).toBe('active plan');
  });

  it('getForStudent returns null for a stale (different-trainer) plan', async () => {
    docs.set('trainerLinks/stu-dp', { trainerId: TRAINER, status: 'active' });
    docs.set('dietPlans/stu-dp', { trainerId: 'other-trainer', text: 'stale' });
    expect(await dietPlanAssignmentService.getForStudent('stu-dp')).toBeNull();
  });

  it('getForStudent returns null when the link is not active', async () => {
    docs.set('trainerLinks/stu-dp', { trainerId: TRAINER, status: 'pending' });
    docs.set('dietPlans/stu-dp', { trainerId: TRAINER, text: 'pending plan' });
    expect(await dietPlanAssignmentService.getForStudent('stu-dp')).toBeNull();
  });

  it('getForStudent returns null when there is no plan', async () => {
    docs.set('trainerLinks/stu-dp', { trainerId: TRAINER, status: 'active' });
    expect(await dietPlanAssignmentService.getForStudent('stu-dp')).toBeNull();
  });
});

// --- FEAT-003: assigned-workout service -------------------------------------
describe('AssignedWorkoutService', () => {
  const DRAFT = {
    name: 'Push Day',
    scheduledDate: '2026-02-01',
    exercises: [
      { exerciseId: 'bench', name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeightKg: 60 },
      { exerciseId: 'ohp', name: 'Overhead Press', targetSets: 3, targetReps: 10, targetWeightKg: null },
    ],
  };

  it('assigns a workout item under assignedWorkouts/{studentUid}/items with trainerId + payload', async () => {
    const result = await assignedWorkoutService.assignForStudent(TRAINER, 'stu-aw', DRAFT);
    expect(result.name).toBe('Push Day');
    expect(result.scheduledDate).toBe('2026-02-01');
    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0]).toMatchObject({ exerciseId: 'bench', name: 'Bench Press', targetSets: 3, targetReps: 8, targetWeightKg: 60 });
    expect(result.exercises[1].targetWeightKg).toBeNull();
    expect(result.id).toBeTruthy();

    const stored = docs.get(`assignedWorkouts/stu-aw/items/${result.id}`);
    expect(stored).toMatchObject({ trainerId: TRAINER, studentUid: 'stu-aw', name: 'Push Day' });
  });

  it('getForStudent returns only the active trainer items, ordered by scheduledDate', async () => {
    docs.set('trainerLinks/stu-aw', { trainerId: TRAINER, status: 'active' });
    docs.set('assignedWorkouts/stu-aw/items/b', {
      id: 'b', trainerId: TRAINER, studentUid: 'stu-aw', name: 'Later', scheduledDate: '2026-03-01', exercises: [],
    });
    docs.set('assignedWorkouts/stu-aw/items/a', {
      id: 'a', trainerId: TRAINER, studentUid: 'stu-aw', name: 'Sooner', scheduledDate: '2026-02-01', exercises: [],
    });
    const items = await assignedWorkoutService.getForStudent('stu-aw');
    expect(items.map((i) => i.name)).toEqual(['Sooner', 'Later']); // upcoming first
  });

  it('getForStudent excludes stale (different-trainer) items', async () => {
    docs.set('trainerLinks/stu-aw', { trainerId: TRAINER, status: 'active' });
    docs.set('assignedWorkouts/stu-aw/items/mine', {
      id: 'mine', trainerId: TRAINER, name: 'Mine', scheduledDate: '2026-02-01', exercises: [],
    });
    docs.set('assignedWorkouts/stu-aw/items/stale', {
      id: 'stale', trainerId: 'other-trainer', name: 'Stale', scheduledDate: '2026-01-01', exercises: [],
    });
    const items = await assignedWorkoutService.getForStudent('stu-aw');
    expect(items.map((i) => i.name)).toEqual(['Mine']);
  });

  it('getForStudent returns [] when the link is not active', async () => {
    docs.set('trainerLinks/stu-aw', { trainerId: TRAINER, status: 'pending' });
    docs.set('assignedWorkouts/stu-aw/items/x', { id: 'x', trainerId: TRAINER, name: 'X', exercises: [] });
    expect(await assignedWorkoutService.getForStudent('stu-aw')).toEqual([]);
  });

  it('getForStudent returns [] when there is no link', async () => {
    expect(await assignedWorkoutService.getForStudent('stu-none')).toEqual([]);
  });
});

// --- FEAT-001: Progress Photos 500 fix + trainer diet-plan reader -----------
describe('TrainerService.studentPhotos (signed URLs)', () => {
  beforeEach(() => {
    docs.set('trainerLinks/stu-ph', { trainerId: TRAINER, status: 'active' });
  });

  it('returns {shared:true, photos:[{url, ...}]} with a signed URL when sharing is on', async () => {
    docs.set('users/stu-ph/profile/data', {
      trainerSharing: { progressPhotos: true },
    });
    docs.set('users/stu-ph/progressPhotos/p1', {
      storagePath: 'users/stu-ph/progressPhotos/p1.jpg',
      takenAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await trainerService.studentPhotos('stu-ph');
    expect(res.shared).toBe(true);
    expect(res.photos).toHaveLength(1);
    expect(res.photos[0]).toMatchObject({ url: 'https://signed.example/x' });
  });

  it('returns {shared:false, photos:[]} without reaching storage when sharing is off', async () => {
    docs.set('users/stu-ph/profile/data', { name: 'No Share' });
    const res = await trainerService.studentPhotos('stu-ph');
    expect(res).toEqual({ shared: false, photos: [] });
  });

  it('still enforces ownership (404) before reading photos', async () => {
    docs.set('trainerLinks/other-ph', { trainerId: 'trainer-2', status: 'active' });
    await expect(assertTrainerOwnsStudent(TRAINER, 'other-ph')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('DietPlanAssignmentService.getForTrainer (FEAT-001 reader)', () => {
  it('returns the resolved plan (text + signed imageUrl) when the doc matches the trainer', async () => {
    docs.set('dietPlans/stu-gt', {
      trainerId: TRAINER,
      studentUid: 'stu-gt',
      text: 'Trainer plan',
      imageStoragePath: `users/${TRAINER}/dietPlans/stu-gt/img.jpg`,
    });
    const plan = await dietPlanAssignmentService.getForTrainer(TRAINER, 'stu-gt');
    expect(plan?.text).toBe('Trainer plan');
    expect(plan?.imageUrl).toBe('https://signed.example/x');
  });

  it('returns null when there is no plan', async () => {
    expect(await dietPlanAssignmentService.getForTrainer(TRAINER, 'stu-gt')).toBeNull();
  });

  it('returns null when the stored plan belongs to a different trainer', async () => {
    docs.set('dietPlans/stu-gt', { trainerId: 'other-trainer', text: 'not yours' });
    expect(await dietPlanAssignmentService.getForTrainer(TRAINER, 'stu-gt')).toBeNull();
  });
});
