import { describe, it, expect, vi } from 'vitest';

/**
 * FEAT-001: diet-plan image signing is best-effort. When getSignedUrl rejects,
 * getForTrainer must still return the plan text with imageUrl:null (never 500),
 * mirroring progressPhotoService. We mock the firebase config so the bucket's
 * getSignedUrl throws, and the dietPlan repository so a plan doc exists.
 */

vi.mock('../config/firebase.js', () => ({
  getBucket: () => ({
    file: () => ({
      getSignedUrl: async () => {
        throw new Error('signing failed');
      },
      delete: async () => undefined,
    }),
  }),
  admin: {
    firestore: {
      FieldValue: { serverTimestamp: () => ({}) },
    },
  },
}));

vi.mock('../repositories/dietPlanRepository.js', () => ({
  dietPlanRepository: {
    get: vi.fn(async (studentUid: string) => ({
      studentUid,
      trainerId: 'trainer-1',
      text: 'Keep hydrated',
      imageStoragePath: 'users/trainer-1/dietPlans/stu/img.jpg',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  },
}));

vi.mock('../repositories/trainerLinkRepository.js', () => ({
  trainerLinkRepository: { get: vi.fn(async () => null) },
}));

import { dietPlanAssignmentService } from '../services/dietPlanAssignmentService.js';

describe('DietPlanAssignmentService.getForTrainer signing failure', () => {
  it('preserves text and yields imageUrl:null when signing throws', async () => {
    const plan = await dietPlanAssignmentService.getForTrainer('trainer-1', 'stu');
    expect(plan).not.toBeNull();
    expect(plan?.text).toBe('Keep hydrated');
    expect(plan?.imageUrl).toBeNull();
  });
});
