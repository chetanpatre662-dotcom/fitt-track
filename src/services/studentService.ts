import { admin } from '../config/firebase.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { trainerRepository } from '../repositories/trainerRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { SHARING_CATEGORIES, type SharingCategory } from '../validators/trainerValidators.js';

/** The fully-resolved five-key sharing map returned to the student. */
export type ResolvedSharing = Record<SharingCategory, boolean>;

/**
 * Resolves the student's stored sharing state into an always-present five-key
 * map. Each category reads profile.trainerSharing[category] when it is an
 * explicit boolean; otherwise progressPhotos falls back to the legacy
 * shareProgressWithTrainer flag and every other category defaults to false.
 * This is the single source of truth the trainer-side isShared gate mirrors.
 */
function resolveSharing(profile: Record<string, unknown> | null): ResolvedSharing {
  const map = profile?.trainerSharing as Record<string, unknown> | undefined;
  const legacy = profile?.shareProgressWithTrainer === true;
  const out = {} as ResolvedSharing;
  for (const category of SHARING_CATEGORIES) {
    const value = map?.[category];
    if (typeof value === 'boolean') {
      out[category] = value;
    } else if (category === 'progressPhotos') {
      out[category] = legacy;
    } else {
      out[category] = false;
    }
  }
  return out;
}

/**
 * Student-side view of the trainer relationship: the "My Trainer" card and the
 * progress-sharing toggle. Only exposes the trainer's public-facing fields
 * (name, photo, referral code, status) — never other students' data.
 */
export class StudentService {
  /**
   * Returns the student's trainer for the "My Trainer" card. Surfaces an
   * `active` (approved) link, a `pending` request so the student sees a
   * "Pending approval" state after sending a request, AND a `rejected` link so
   * the student is told their request was declined and offered a re-request;
   * an `inactive` link (or no link) maps to {trainer:null} so the UI falls back
   * to "Add Trainer". The connected Trainer Code is exposed ONLY once the link
   * is `active` (approved) — pending and rejected show no code.
   */
  async getTrainer(studentUid: string): Promise<{ trainer: Record<string, unknown> | null }> {
    const link = await trainerLinkRepository.get(studentUid);
    const surfaced = link && ['active', 'pending', 'rejected'].includes(link.status as string);
    if (!surfaced) {
      return { trainer: null };
    }

    const trainer = await trainerRepository.get(link.trainerId as string);
    if (!trainer) return { trainer: null };

    const isActive = link.status === 'active';
    // The student's own resolved sharing preferences (always present, five
    // keys) so the My Trainer tab can render the per-category toggles without a
    // second round-trip.
    const profile = await profileRepository.get(studentUid);
    const sharing = resolveSharing(profile);

    const card: Record<string, unknown> = {
      trainerId: trainer.trainerId ?? trainer.id,
      name: trainer.name ?? null,
      photoUrl: trainer.photoUrl ?? null,
      // Read-only connected code only after approval; hidden while pending.
      referralCode: isActive ? trainer.referralCode ?? null : null,
      status: trainer.status ?? 'active',
      associationStatus: link.status,
      sharing,
    };
    // Surface public trainer fields ONLY when present on the trainer doc; omit
    // (never null) when absent so the client can tell "unset" from "empty".
    if (typeof trainer.experience !== 'undefined' && trainer.experience !== null) {
      card.experience = trainer.experience;
    }
    if (typeof trainer.bio !== 'undefined' && trainer.bio !== null) {
      card.bio = trainer.bio;
    }

    return { trainer: card };
  }

  /**
   * Updates the student's granular progress-sharing preferences. Reads the
   * current trainerSharing map (or {}), merges the provided category keys,
   * mirrors progressPhotos onto the legacy shareProgressWithTrainer boolean
   * when that key is set (so old readers stay correct), and returns the
   * fully-resolved five-key map. `patch` keys are a subset of the five
   * categories (the controller has already mapped a legacy-only body to
   * {progressPhotos}).
   */
  async setSharing(
    studentUid: string,
    patch: Partial<Record<SharingCategory, boolean>>,
  ): Promise<ResolvedSharing> {
    const profile = await profileRepository.get(studentUid);
    const current = (profile?.trainerSharing as Record<string, unknown> | undefined) ?? {};
    const nextMap: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'boolean') nextMap[key] = value;
    }
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'boolean') nextMap[key] = value;
    }

    const update: Record<string, unknown> = {
      trainerSharing: nextMap,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Keep the legacy boolean in sync whenever progressPhotos is set, so any
    // reader still on shareProgressWithTrainer observes the same intent.
    if (typeof patch.progressPhotos === 'boolean') {
      update.shareProgressWithTrainer = patch.progressPhotos;
    }

    const saved = await profileRepository.upsert(studentUid, update);
    return resolveSharing(saved);
  }
}

export const studentService = new StudentService();
