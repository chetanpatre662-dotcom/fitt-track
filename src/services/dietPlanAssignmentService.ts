import { admin, getBucket } from '../config/firebase.js';
import { dietPlanRepository } from '../repositories/dietPlanRepository.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';
import { BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** TTL for the student-facing diet-plan image signed URL (15 minutes). */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** The payload a trainer assigns: at least one of text/imageStoragePath. */
export interface DietPlanInput {
  text?: string | null;
  imageStoragePath?: string | null;
}

/** The resolved diet plan returned to a client (image via signed URL only). */
export interface ResolvedDietPlan {
  text: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
}

/**
 * Trainer-assigned diet plans. The plan document lives at dietPlans/{studentUid}
 * (Admin-SDK-only). The image bytes live in Firebase Storage under the
 * trainer's OWN users/{trainerId}/dietPlans/{studentUid}/ prefix (allowed by
 * the existing owner-only storage.rules). A student never reads that path
 * directly: the backend bridges it with a short-lived signed READ url placed in
 * `imageUrl`, exactly mirroring progressPhotoService's signing mechanism, so
 * storage.rules stays unchanged and no client-direct cross-user Storage read is
 * introduced.
 */
export class DietPlanAssignmentService {
  /**
   * Validates that `storagePath` is inside the trainer's own
   * users/{trainerId}/dietPlans/{studentUid}/ folder and free of traversal.
   * Mirrors progressPhotoService.assertOwnedPath so a trainer can never point a
   * student's plan at another user's object.
   */
  private assertOwnedPath(trainerId: string, studentUid: string, storagePath: string): void {
    const prefix = `users/${trainerId}/dietPlans/${studentUid}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes('..')) {
      throw new BadRequestError('Invalid storage path for this diet plan.');
    }
  }

  /**
   * Upserts the student's diet plan on behalf of `trainerId`. Replaces any
   * prior plan in whole: when a new image replaces an existing one (different
   * path), the old object is best-effort deleted so no orphan is left; when the
   * caller omits the image, the stored image path is cleared. The caller is
   * expected to have already asserted trainer ownership of the student.
   */
  async assignForStudent(
    trainerId: string,
    studentUid: string,
    input: DietPlanInput,
  ): Promise<ResolvedDietPlan> {
    const text = typeof input.text === 'string' && input.text.length > 0 ? input.text : null;
    const imageStoragePath =
      typeof input.imageStoragePath === 'string' && input.imageStoragePath.length > 0
        ? input.imageStoragePath
        : null;

    if (imageStoragePath) {
      this.assertOwnedPath(trainerId, studentUid, imageStoragePath);
    }

    const existing = await dietPlanRepository.get(studentUid);
    const previousPath = (existing?.imageStoragePath as string | undefined) ?? null;

    const saved = await dietPlanRepository.upsert(studentUid, {
      trainerId,
      studentUid,
      text,
      imageStoragePath,
      ...(existing ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    });

    // Best-effort cleanup: drop a replaced/removed image object so Storage does
    // not accumulate orphans. Never fatal — the plan write is authoritative.
    if (previousPath && previousPath !== imageStoragePath) {
      try {
        await getBucket().file(previousPath).delete({ ignoreNotFound: true });
      } catch (err) {
        logger.warn({ err, trainerId }, 'Failed to delete replaced diet-plan image (continuing)');
      }
    }

    return this.resolve(saved);
  }

  /**
   * Returns the student's own diet plan, but ONLY when the caller currently has
   * an ACTIVE trainer link AND the stored plan was assigned by that same active
   * trainer. A stale plan (assigned by a previous trainer) or any
   * inactive/pending link yields {text:null, imageUrl:null} so a student never
   * sees a plan from a trainer they are no longer connected to.
   */
  async getForStudent(studentUid: string): Promise<ResolvedDietPlan | null> {
    const link = await trainerLinkRepository.get(studentUid);
    if (!link || link.status !== 'active') return null;
    const activeTrainerId = link.trainerId as string | undefined;

    const plan = await dietPlanRepository.get(studentUid);
    if (!plan || !activeTrainerId || plan.trainerId !== activeTrainerId) return null;

    return this.resolve(plan);
  }

  /**
   * Shapes a stored plan doc into the client response, signing a short-lived
   * READ url for the image when present. Signing is best-effort: a failure
   * yields imageUrl:null (warn log) while the text is still returned, exactly
   * like progressPhotoService.
   */
  private async resolve(plan: Record<string, unknown>): Promise<ResolvedDietPlan> {
    const text = (plan.text as string | undefined) ?? null;
    const imageStoragePath = (plan.imageStoragePath as string | undefined) ?? null;

    let imageUrl: string | null = null;
    if (imageStoragePath) {
      try {
        const [signed] = await getBucket()
          .file(imageStoragePath)
          .getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
        imageUrl = signed;
      } catch (err) {
        logger.warn({ err }, 'Failed to sign diet-plan image URL (continuing)');
      }
    }

    return { text, imageUrl, updatedAt: toIso(plan.updatedAt) };
  }
}

function toIso(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export const dietPlanAssignmentService = new DietPlanAssignmentService();
