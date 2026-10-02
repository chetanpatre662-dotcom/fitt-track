import { admin, getBucket } from '../config/firebase.js';
import { progressPhotoRepository } from '../repositories/progressPhotoRepository.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ProgressPhotoCreateInput } from '../validators/progressPhotoValidators.js';

/**
 * Progress-photo metadata service. Photos are private per user: the storage
 * path MUST live under the caller's own users/{uid}/ prefix, so one user can
 * never register (or later serve) another user's image.
 */
export class ProgressPhotoService {
  private assertOwnedPath(uid: string, storagePath: string): void {
    const prefix = `users/${uid}/`;
    // Reject paths outside the caller's own folder or with traversal.
    if (!storagePath.startsWith(prefix) || storagePath.includes('..')) {
      throw new BadRequestError('Invalid storage path for this user.');
    }
  }

  async create(uid: string, input: ProgressPhotoCreateInput): Promise<Record<string, unknown>> {
    this.assertOwnedPath(uid, input.storagePath);
    const id = progressPhotoRepository.newId(uid);
    const takenAt = input.takenAt ? new Date(input.takenAt) : new Date();
    return progressPhotoRepository.set(uid, id, {
      storagePath: input.storagePath,
      category: input.category,
      caption: input.caption ?? null,
      takenAt: admin.firestore.Timestamp.fromDate(takenAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async list(uid: string): Promise<Record<string, unknown>[]> {
    const rows = await progressPhotoRepository.list(uid);
    return rows.map((r) => ({ ...r, takenAt: toIso(r.takenAt) }));
  }

  /**
   * Deletes a photo's metadata AND its Storage object, so deleting never leaves
   * an orphaned file. The Storage delete is best-effort (a missing object is
   * not fatal); the metadata delete is authoritative.
   */
  async delete(uid: string, id: string): Promise<void> {
    const existing = await progressPhotoRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Progress photo not found');

    const storagePath = existing.storagePath as string | undefined;
    if (storagePath) {
      // Re-check ownership before touching Storage.
      this.assertOwnedPath(uid, storagePath);
      try {
        await getBucket().file(storagePath).delete({ ignoreNotFound: true });
      } catch (err) {
        // Non-fatal: log and still remove metadata so the UI stays consistent.
        logger.warn({ err, uid }, 'Failed to delete progress photo object (continuing)');
      }
    }

    await progressPhotoRepository.delete(uid, id);
  }
}

function toIso(value: unknown): string | null {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

export const progressPhotoService = new ProgressPhotoService();
