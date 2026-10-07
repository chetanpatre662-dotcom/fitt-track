import { admin } from '../config/firebase.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { trainerRepository } from '../repositories/trainerRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';

/**
 * Student-side view of the trainer relationship: the "My Trainer" card and the
 * progress-sharing toggle. Only exposes the trainer's public-facing fields
 * (name, photo, referral code, status) — never other students' data.
 */
export class StudentService {
  /**
   * Returns the student's trainer, or {trainer:null} when there is no active
   * link (unlinked, or a non-active link).
   */
  async getTrainer(studentUid: string): Promise<{ trainer: Record<string, unknown> | null }> {
    const link = await trainerLinkRepository.get(studentUid);
    if (!link || link.status !== 'active') return { trainer: null };

    const trainer = await trainerRepository.get(link.trainerId as string);
    if (!trainer) return { trainer: null };

    return {
      trainer: {
        trainerId: trainer.trainerId ?? trainer.id,
        name: trainer.name ?? null,
        photoUrl: trainer.photoUrl ?? null,
        referralCode: trainer.referralCode ?? null,
        status: trainer.status ?? 'active',
        associationStatus: link.status,
      },
    };
  }

  /** Updates the student's progress-sharing flag on their profile. */
  async setSharing(studentUid: string, share: boolean): Promise<{ shareProgressWithTrainer: boolean }> {
    await profileRepository.upsert(studentUid, {
      shareProgressWithTrainer: share,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { shareProgressWithTrainer: share };
  }
}

export const studentService = new StudentService();
