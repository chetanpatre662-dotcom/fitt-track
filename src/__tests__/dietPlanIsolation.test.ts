import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * FEAT-002: trainer/student diet-plan isolation + idempotent (double-tap-safe)
 * upload semantics, exercised at the service layer.
 *
 * (a) Student B cannot read Student A's plan: getForStudent keys the CALLER's
 *     own uid as the dietPlans doc id and additionally requires an ACTIVE link
 *     whose trainerId matches the stored plan's trainerId — a plan assigned by
 *     a trainer the caller is not actively linked to resolves to null.
 * (b) A text-only re-assign that reuses the SAME fixed image path does not
 *     orphan (delete) the existing image, and preserves it on the doc.
 * (c) Two back-to-back assigns with the fixed identity-only object name
 *     `plan.jpg` (double-tap / retry) overwrite ONE storage object and leave a
 *     SINGLE plan doc — no best-effort delete fires because the path is equal.
 *
 * We fake the firebase config bucket (recording every file()/delete call) and
 * the diet-plan + trainer-link repositories with an in-memory store so the real
 * service logic (ownership-free reads, path equality, active-link gate) runs.
 */

const FIXED_PATH = 'users/trainer-1/dietPlans/stu-a/plan.jpg';

// --- Bucket fake: record delete calls so we can assert no orphaning ----------
const deletedPaths: string[] = [];
let signCount = 0;

vi.mock('../config/firebase.js', () => ({
  getBucket: () => ({
    file: (path: string) => ({
      getSignedUrl: async () => {
        signCount += 1;
        return [`https://signed.example/${encodeURIComponent(path)}`];
      },
      delete: async () => {
        deletedPaths.push(path);
        return undefined;
      },
    }),
  }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => '__ts__' },
    },
  },
}));

// --- In-memory diet-plan repository ------------------------------------------
const planStore = new Map<string, Record<string, unknown>>();

vi.mock('../repositories/dietPlanRepository.js', () => ({
  dietPlanRepository: {
    get: vi.fn(async (studentUid: string) => planStore.get(studentUid) ?? null),
    upsert: vi.fn(async (studentUid: string, data: Record<string, unknown>) => {
      const prev = planStore.get(studentUid) ?? {};
      const merged = { ...prev, ...data, studentUid, updatedAt: '__ts__' };
      planStore.set(studentUid, merged);
      return merged;
    }),
  },
}));

// --- In-memory trainer-link repository ---------------------------------------
const linkStore = new Map<string, Record<string, unknown>>();

vi.mock('../repositories/trainerLinkRepository.js', () => ({
  trainerLinkRepository: {
    get: vi.fn(async (studentUid: string) => linkStore.get(studentUid) ?? null),
  },
}));

import { dietPlanAssignmentService } from '../services/dietPlanAssignmentService.js';

beforeEach(() => {
  deletedPaths.length = 0;
  signCount = 0;
  planStore.clear();
  linkStore.clear();
});

describe('DietPlanAssignmentService isolation', () => {
  it('(a) student B cannot read student A plan: getForStudent keys own uid + active-trainer match', async () => {
    // Student A has a plan from trainer-1 and an ACTIVE link to trainer-1.
    planStore.set('stu-a', {
      studentUid: 'stu-a',
      trainerId: 'trainer-1',
      text: 'A private plan',
      imageStoragePath: FIXED_PATH,
    });
    linkStore.set('stu-a', { trainerId: 'trainer-1', status: 'active' });

    // Student A reading their OWN uid sees it.
    const asA = await dietPlanAssignmentService.getForStudent('stu-a');
    expect(asA?.text).toBe('A private plan');

    // Student B has no doc under their own uid — the route keys the caller's own
    // uid, so B can never address A's doc. Resolves to null.
    const asB = await dietPlanAssignmentService.getForStudent('stu-b');
    expect(asB).toBeNull();

    // Even if B somehow had a stored plan from a DIFFERENT trainer but an active
    // link to someone else, the trainerId mismatch yields null (no cross-leak).
    planStore.set('stu-b', { studentUid: 'stu-b', trainerId: 'trainer-1', text: 'leaked?' });
    linkStore.set('stu-b', { trainerId: 'trainer-2', status: 'active' });
    const asBMismatch = await dietPlanAssignmentService.getForStudent('stu-b');
    expect(asBMismatch).toBeNull();
  });

  it('(b) text-only re-assign over the same fixed image path preserves the image and never orphans', async () => {
    // Seed an existing plan that already points at the fixed image object.
    planStore.set('stu-a', {
      studentUid: 'stu-a',
      trainerId: 'trainer-1',
      text: 'old',
      imageStoragePath: FIXED_PATH,
    });

    // Trainer re-assigns new text AND re-sends the same fixed image path (the
    // client always uploads to plan.jpg, so a text edit resubmits the same path).
    const saved = await dietPlanAssignmentService.assignForStudent('trainer-1', 'stu-a', {
      text: 'new text',
      imageStoragePath: FIXED_PATH,
    });

    expect(saved.text).toBe('new text');
    expect(saved.imageUrl).toContain('plan.jpg');
    // Path unchanged -> no best-effort delete of the existing object.
    expect(deletedPaths).toHaveLength(0);
    expect(planStore.get('stu-a')?.imageStoragePath).toBe(FIXED_PATH);
  });

  it('(c) double-tap/retry assign with the fixed plan.jpg name = single object + single doc (no orphan)', async () => {
    const input = { text: 'plan', imageStoragePath: FIXED_PATH };

    // Two rapid identical assigns (double-tap / retry).
    await dietPlanAssignmentService.assignForStudent('trainer-1', 'stu-a', input);
    await dietPlanAssignmentService.assignForStudent('trainer-1', 'stu-a', input);

    // Exactly one plan doc for the student (upsert on the same key).
    expect(planStore.size).toBe(1);
    expect(planStore.get('stu-a')?.imageStoragePath).toBe(FIXED_PATH);
    // The fixed name means the "replaced path" is always equal to the previous
    // one, so the best-effort delete never fires — no orphaned second object.
    expect(deletedPaths).toHaveLength(0);
  });
});
