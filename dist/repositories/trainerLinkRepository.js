"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trainerLinkRepository = exports.TrainerLinkRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for trainerLinks/{studentUid}: the single source of truth for the
 * trainer <-> student relationship, keyed by the student's uid (one student
 * belongs to at most one trainer).
 *
 * Backend-Admin-SDK-write-only and never client-readable (firestore.rules).
 */
class TrainerLinkRepository {
    get col() {
        return (0, firebase_js_1.getFirestore)().collection('trainerLinks');
    }
    /** Returns trainerLinks/{studentUid} or null. */
    async get(studentUid) {
        const snap = await this.col.doc(studentUid).get();
        if (!snap.exists)
            return null;
        return { studentUid: snap.id, ...snap.data() };
    }
    /** All active links owned by a trainer, newest first. */
    async listByTrainer(trainerId) {
        const snap = await this.col
            .where('trainerId', '==', trainerId)
            .where('status', '==', 'active')
            .get();
        const rows = snap.docs.map((d) => ({
            studentUid: d.id,
            ...d.data(),
        }));
        rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
        return rows;
    }
    /** Direct document reference (used inside transactions). */
    doc(studentUid) {
        return this.col.doc(studentUid);
    }
    /** Shared FieldValue helpers so callers can build transactional writes. */
    get fieldValue() {
        return firebase_js_1.admin.firestore.FieldValue;
    }
}
exports.TrainerLinkRepository = TrainerLinkRepository;
function tsMillis(value) {
    const t = value;
    if (t && typeof t.toMillis === 'function')
        return t.toMillis();
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? 0 : ms;
    }
    return 0;
}
exports.trainerLinkRepository = new TrainerLinkRepository();
//# sourceMappingURL=trainerLinkRepository.js.map