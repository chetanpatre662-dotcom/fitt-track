import { getFirestore, admin } from '../config/firebase.js';
import { trainerRepository } from '../repositories/trainerRepository.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { profileRepository } from '../repositories/profileRepository.js';
import { workoutRepository } from '../repositories/workoutRepository.js';
import { nutritionService } from './nutritionService.js';
import { waterService } from './waterService.js';
import { progressService, type RangeKey } from './progressService.js';
import { progressPhotoService } from './progressPhotoService.js';
import { roleService } from './roleService.js';
import { assertTrainerOwnsStudent } from '../middleware/role.js';
import { ConflictError } from '../utils/errors.js';

/** Result of a referral-link attempt. */
export interface LinkResult {
  linked: boolean;
  reason?: 'invalid_code';
  trainerId?: string;
  trainerName?: string;
}

/**
 * Trainer-side business logic: student linking, trainer profile/dashboard, and
 * per-student data views. Per-student views reuse the existing per-feature
 * services by passing the student's uid as the uid — authorization is enforced
 * by the caller (assertTrainerOwnsStudent) BEFORE any student data is read.
 */
export class TrainerService {
  /**
   * Links the authenticated student to the trainer that owns `referralCode`.
   * - Unknown code -> soft success {linked:false, reason:'invalid_code'} (no
   *   link, so a typo never errors out registration).
   * - Trainer accounts cannot be linked as a student -> 409.
   * - Valid code -> transactionally create trainerLinks/{studentUid}, mirror
   *   profile.trainerId, and increment the trainer's totalStudents EXACTLY
   *   once (idempotent: a re-link to the same trainer does not double count).
   */
  async linkStudent(studentUid: string, referralCode: string): Promise<LinkResult> {
    const codeLower = referralCode.trim().toLowerCase();
    const trainerId = await trainerRepository.findTrainerIdByReferralCode(codeLower);
    if (!trainerId) {
      return { linked: false, reason: 'invalid_code' };
    }

    const role = await roleService.resolveRole(studentUid);
    if (role === 'trainer') {
      throw new ConflictError('Trainer accounts cannot be linked to another trainer.');
    }

    const db = getFirestore();
    const linkRef = trainerLinkRepository.doc(studentUid);
    const trainerRef = db.collection('trainers').doc(trainerId);
    const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');

    await db.runTransaction(async (tx) => {
      const linkSnap = await tx.get(linkRef);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const existing = linkSnap.exists ? linkSnap.data() : undefined;
      const alreadyActiveSameTrainer =
        existing?.trainerId === trainerId && existing?.status === 'active';

      tx.set(
        linkRef,
        {
          studentUid,
          trainerId,
          status: 'active',
          ...(linkSnap.exists ? {} : { createdAt: now }),
          updatedAt: now,
        },
        { merge: true },
      );

      // Mirror the association onto the student's profile (best-effort, kept in
      // sync here so the student app can show "My Trainer" without a join).
      tx.set(profileRef, { trainerId, updatedAt: now }, { merge: true });

      // Only increment when this is a brand-new active link to this trainer.
      if (!alreadyActiveSameTrainer) {
        tx.set(
          trainerRef,
          {
            totalStudents: admin.firestore.FieldValue.increment(1),
            updatedAt: now,
          },
          { merge: true },
        );
      }
    });

    const trainer = await trainerRepository.get(trainerId);
    return {
      linked: true,
      trainerId,
      trainerName: (trainer?.name as string | undefined) ?? undefined,
    };
  }

  /** Trainer profile with an authoritative live active-student count. */
  async getProfile(trainerId: string): Promise<Record<string, unknown>> {
    const trainer = (await trainerRepository.get(trainerId)) ?? { trainerId };
    const activeStudents = await trainerRepository.countActiveStudents(trainerId);
    return { ...trainer, totalStudents: activeStudents };
  }

  /** Per-student summary cards for the dashboard student list. */
  async listStudents(trainerId: string): Promise<Record<string, unknown>[]> {
    const links = await trainerLinkRepository.listByTrainer(trainerId);
    const today = todayKey();

    const summaries = await Promise.all(
      links.map(async (link) => {
        const studentUid = link.studentUid as string;
        const [profile, latestWorkouts, nutrition, water] = await Promise.all([
          profileRepository.get(studentUid),
          workoutRepository.list(studentUid, { status: 'completed', limit: 1 }),
          nutritionService.getDay(studentUid, today),
          waterService.getDay(studentUid, today),
        ]);

        const lastWorkout = latestWorkouts[0] ?? null;
        return {
          studentUid,
          name: (profile?.name as string | undefined) ?? null,
          photoUrl: (profile?.photoUrl as string | undefined) ?? null,
          goal: (profile?.goals as string[] | undefined)?.[0] ?? null,
          currentWeightKg: (profile?.weightKg as number | undefined) ?? null,
          lastWorkout: lastWorkout
            ? {
                id: lastWorkout.id,
                name: lastWorkout.name,
                startedAt: toIso(lastWorkout.startedAt),
                totalVolume: lastWorkout.totalVolume ?? 0,
              }
            : null,
          todayActivity: {
            caloriesConsumed: nutrition.totals?.calories ?? 0,
            waterMl: water.totalMl ?? 0,
            hasActivityToday: (nutrition.entries?.length ?? 0) > 0 || (water.totalMl ?? 0) > 0,
          },
          linkedAt: toIso(link.createdAt),
        };
      }),
    );
    return summaries;
  }

  // --- Per-student detail views (authorization asserted by caller first) ---

  async studentOverview(studentUid: string): Promise<Record<string, unknown>> {
    const [profile, link] = await Promise.all([
      profileRepository.get(studentUid),
      trainerLinkRepository.get(studentUid),
    ]);
    return {
      studentUid,
      profile: profile ?? null,
      trainerAssociation: link
        ? { trainerId: link.trainerId, status: link.status, linkedAt: toIso(link.createdAt) }
        : null,
    };
  }

  /** The student's completed workouts for a given day. */
  async studentWorkoutsForDate(studentUid: string, dateKey: string): Promise<Record<string, unknown>[]> {
    const all = await workoutRepository.list(studentUid, { status: 'completed' });
    return all.filter((w) => toDateKey(w.startedAt) === dateKey);
  }

  async studentWorkoutHistory(studentUid: string, limit = 100): Promise<Record<string, unknown>[]> {
    return progressService.history(studentUid, 'all', limit);
  }

  async studentNutrition(studentUid: string, dateKey: string) {
    return nutritionService.getDay(studentUid, dateKey);
  }

  async studentWater(studentUid: string, dateKey: string) {
    return waterService.getDay(studentUid, dateKey);
  }

  async studentProgress(studentUid: string, range: RangeKey = '90d') {
    return progressService.workoutSummary(studentUid, range);
  }

  /**
   * Progress photos, gated by the student's shareProgressWithTrainer flag.
   * When sharing is off, returns an empty list. Photos are returned with
   * short-lived signed URLs (never public).
   */
  async studentPhotos(studentUid: string): Promise<{ shared: boolean; photos: Record<string, unknown>[] }> {
    const profile = await profileRepository.get(studentUid);
    const shared = profile?.shareProgressWithTrainer === true;
    if (!shared) return { shared: false, photos: [] };
    const photos = await progressPhotoService.listWithSignedUrls(studentUid);
    return { shared: true, photos };
  }

  /** Convenience: assert ownership then run a loader. */
  async forOwnedStudent<T>(
    trainerId: string,
    studentUid: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    await assertTrainerOwnsStudent(trainerId, studentUid);
    return loader();
  }
}

function todayKey(): string {
  return toDateKeyFromDate(new Date());
}

function toDateKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateKey(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return toDateKeyFromDate(t.toDate());
  return null;
}

function toIso(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export const trainerService = new TrainerService();
