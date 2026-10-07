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
   * Returns the student's trainer for the "My Trainer" card. Surfaces both an
   * `active` (approved) link AND a `pending` request so the student sees a
   * "Pending approval" state after sending a request; a `rejected`/`inactive`
   * link (or no link) maps to {trainer:null} so the UI falls back to "Add
   * Trainer". The connected Trainer Code is exposed ONLY once the link is
   * `active` (approved) — a pending request shows no code yet.
   */
  async getTrainer(studentUid: string): Promise<{ trainer: Record<string, unknown> | null }> {
    const link = await trainerLinkRepository.get(studentUid);
    if (!link || (link.status !== 'active' && link.status !== 'pending')) {
      return { trainer: null };
    }

    const trainer = await trainerRepository.get(link.trainerId as string);
    if (!trainer) return { trainer: null };

    const isActive = link.status === 'active';
    return {
      trainer: {
        trainerId: trainer.trainerId ?? trainer.id,
        name: trainer.name ?? null,
        photoUrl: trainer.photoUrl ?? null,
        // Read-only connected code only after approval; hidden while pending.
        referralCode: isActive ? trainer.referralCode ?? null : null,
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
