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
import { studentService } from '../services/studentService.js';
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

  it('treats a rejected link as no trainer (fall back to Add Trainer)', async () => {
    docs.set('trainerLinks/stu-rej', { trainerId: TRAINER, status: 'rejected' });
    expect(await studentService.getTrainer('stu-rej')).toEqual({ trainer: null });
  });

  it('treats an inactive link as no trainer', async () => {
    docs.set('trainerLinks/stu-inact', { trainerId: TRAINER, status: 'inactive' });
    expect(await studentService.getTrainer('stu-inact')).toEqual({ trainer: null });
  });
});
