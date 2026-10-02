"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressPhotoService = exports.ProgressPhotoService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const progressPhotoRepository_js_1 = require("../repositories/progressPhotoRepository.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Progress-photo metadata service. Photos are private per user: the storage
 * path MUST live under the caller's own users/{uid}/ prefix, so one user can
 * never register (or later serve) another user's image.
 */
class ProgressPhotoService {
    assertOwnedPath(uid, storagePath) {
        const prefix = `users/${uid}/`;
        // Reject paths outside the caller's own folder or with traversal.
        if (!storagePath.startsWith(prefix) || storagePath.includes('..')) {
            throw new errors_js_1.BadRequestError('Invalid storage path for this user.');
        }
    }
    async create(uid, input) {
        this.assertOwnedPath(uid, input.storagePath);
        const id = progressPhotoRepository_js_1.progressPhotoRepository.newId(uid);
        const takenAt = input.takenAt ? new Date(input.takenAt) : new Date();
        return progressPhotoRepository_js_1.progressPhotoRepository.set(uid, id, {
            storagePath: input.storagePath,
            category: input.category,
            caption: input.caption ?? null,
            takenAt: firebase_js_1.admin.firestore.Timestamp.fromDate(takenAt),
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    async list(uid) {
        const rows = await progressPhotoRepository_js_1.progressPhotoRepository.list(uid);
        return rows.map((r) => ({ ...r, takenAt: toIso(r.takenAt) }));
    }
    /**
     * Deletes a photo's metadata AND its Storage object, so deleting never leaves
     * an orphaned file. The Storage delete is best-effort (a missing object is
     * not fatal); the metadata delete is authoritative.
     */
    async delete(uid, id) {
        const existing = await progressPhotoRepository_js_1.progressPhotoRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Progress photo not found');
        const storagePath = existing.storagePath;
        if (storagePath) {
            // Re-check ownership before touching Storage.
            this.assertOwnedPath(uid, storagePath);
            try {
                await (0, firebase_js_1.getBucket)().file(storagePath).delete({ ignoreNotFound: true });
            }
            catch (err) {
                // Non-fatal: log and still remove metadata so the UI stays consistent.
                logger_js_1.logger.warn({ err, uid }, 'Failed to delete progress photo object (continuing)');
            }
        }
        await progressPhotoRepository_js_1.progressPhotoRepository.delete(uid, id);
    }
}
exports.ProgressPhotoService = ProgressPhotoService;
function toIso(value) {
    const t = value;
    if (t && typeof t.toDate === 'function')
        return t.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
exports.progressPhotoService = new ProgressPhotoService();
//# sourceMappingURL=progressPhotoService.js.map