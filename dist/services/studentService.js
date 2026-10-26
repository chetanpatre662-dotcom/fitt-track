"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentService = exports.StudentService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const trainerLinkRepository_js_1 = require("../repositories/trainerLinkRepository.js");
const trainerRepository_js_1 = require("../repositories/trainerRepository.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
const roleService_js_1 = require("./roleService.js");
const referralCode_js_1 = require("../utils/referralCode.js");
const trainerValidators_js_1 = require("../validators/trainerValidators.js");
/**
 * Resolves the student's stored sharing state into an always-present five-key
 * map. Each category reads profile.trainerSharing[category] when it is an
 * explicit boolean; otherwise progressPhotos falls back to the legacy
 * shareProgressWithTrainer flag and every other category defaults to false.
 * This is the single source of truth the trainer-side isShared gate mirrors.
 */
function resolveSharing(profile) {
    const map = profile?.trainerSharing;
    const legacy = profile?.shareProgressWithTrainer === true;
    const out = {};
    for (const category of trainerValidators_js_1.SHARING_CATEGORIES) {
        const value = map?.[category];
        if (typeof value === 'boolean') {
            out[category] = value;
        }
        else if (category === 'progressPhotos') {
            out[category] = legacy;
        }
        else {
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
class StudentService {
    /**
     * Returns the student's trainer for the "My Trainer" card. Surfaces an
     * `active` (approved) link, a `pending` request so the student sees a
     * "Pending approval" state after sending a request, AND a `rejected` link so
     * the student is told their request was declined and offered a re-request;
     * an `inactive` link (or no link) maps to {trainer:null} so the UI falls back
     * to "Add Trainer". The connected Trainer Code is exposed ONLY once the link
     * is `active` (approved) — pending and rejected show no code.
     */
    async getTrainer(studentUid) {
        const link = await trainerLinkRepository_js_1.trainerLinkRepository.get(studentUid);
        const surfaced = link && ['active', 'pending', 'rejected'].includes(link.status);
        if (!surfaced) {
            return { trainer: null };
        }
        const trainer = await trainerRepository_js_1.trainerRepository.get(link.trainerId);
        if (!trainer)
            return { trainer: null };
        const isActive = link.status === 'active';
        // The student's own resolved sharing preferences (always present, five
        // keys) so the My Trainer tab can render the per-category toggles without a
        // second round-trip.
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        const sharing = resolveSharing(profile);
        const card = {
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
        // Public social links, surfaced with the SAME conditional-append contract
        // as experience/bio. This `card` is a strict allow-list: it reads only the
        // specific public keys and NEVER spreads the trainer doc, so the private
        // profile fields (mobile, dateOfBirth, heightCm, weightKg, email) are
        // omitted by construction and can never leak to a student (Req 10 / privacy
        // invariant, enforced server-side).
        if (typeof trainer.youtubeUrl !== 'undefined' && trainer.youtubeUrl !== null) {
            card.youtubeUrl = trainer.youtubeUrl;
        }
        if (typeof trainer.instagramUrl !== 'undefined' && trainer.instagramUrl !== null) {
            card.instagramUrl = trainer.instagramUrl;
        }
        return { trainer: card };
    }
    /**
     * Public-by-code preview for the QR scan / manual-entry connect flow
     * (GET /api/student/trainer/preview?code=). Resolves the referral code via
     * the index doc and the SAME role/status checks as requestTrainer, then
     * returns ONLY the public fields — the identical conditional-append contract
     * as getTrainer (optional public fields omitted when absent; private fields
     * never read). It performs NO linking.
     *
     * Anti-enumeration: a well-formed but unknown/inactive/non-trainer code
     * resolves to { found: false } (the route still returns 200) rather than
     * leaking whether a code exists. A valid active code returns
     * { found: true, trainer: { name, photoUrl, experience?, bio?, youtubeUrl?,
     * instagramUrl? } } even when the trainer's public profile is incomplete
     * (name is always present; the UI may still send a request).
     */
    async previewByCode(code) {
        const codeLower = (0, referralCode_js_1.normalize)(code);
        const codeDoc = await trainerRepository_js_1.trainerRepository.getByReferralCodeDoc(codeLower);
        if (!codeDoc || !codeDoc.active)
            return { found: false };
        const trainerId = codeDoc.trainerId;
        const trainer = await trainerRepository_js_1.trainerRepository.get(trainerId);
        const resolvedRole = await roleService_js_1.roleService.resolveRole(trainerId);
        if (resolvedRole !== 'trainer' || !trainer || trainer.status !== 'active') {
            return { found: false };
        }
        // Public allow-list (never spreads the doc; private fields never read).
        const card = {
            name: trainer.name ?? null,
            photoUrl: trainer.photoUrl ?? null,
        };
        if (typeof trainer.experience !== 'undefined' && trainer.experience !== null) {
            card.experience = trainer.experience;
        }
        if (typeof trainer.bio !== 'undefined' && trainer.bio !== null) {
            card.bio = trainer.bio;
        }
        if (typeof trainer.youtubeUrl !== 'undefined' && trainer.youtubeUrl !== null) {
            card.youtubeUrl = trainer.youtubeUrl;
        }
        if (typeof trainer.instagramUrl !== 'undefined' && trainer.instagramUrl !== null) {
            card.instagramUrl = trainer.instagramUrl;
        }
        return { found: true, trainer: card };
    }
    /**
     * Student-initiated "Leave Trainer" (§4): the student-side mirror of
     * trainerService.removeStudent. Keyed by the authenticated student's own uid
     * (never a body/query value), it runs ONE transaction over
     * trainerLinks/{studentUid} (doc id == uid) and captures the pre-action
     * status as `previousStatus` ('none' when there is no link doc).
     *
     * Branches:
     * - active  -> flip status:'inactive' and clear the profile mirror
     *   (users/{studentUid}/profile/data.{trainerId:null,trainerStatus:null}) —
     *   the student leaves an approved trainer;
     * - pending -> same inactive + mirror-clear (withdraw a request the trainer
     *   had not yet acted on);
     * - rejected/inactive/none -> idempotent no-op success (nothing to write).
     *
     * Deliberately NON-destructive, exactly like removeStudent: it writes ONLY
     * trainerLinks/{studentUid} (and the profile mirror), touches NOTHING on the
     * trainer doc, and NEVER deletes any trainer-created workouts/diet/history —
     * access revokes automatically because every per-student gate requires an
     * ACTIVE link. A double-leave is safe (the second call sees a non-active
     * previousStatus and no-ops), and because the doc id is the caller's uid a
     * student can only ever affect their own link.
     */
    async leaveTrainer(studentUid) {
        const db = (0, firebase_js_1.getFirestore)();
        const linkRef = trainerLinkRepository_js_1.trainerLinkRepository.doc(studentUid);
        const profileRef = db.collection('users').doc(studentUid).collection('profile').doc('data');
        const previousStatus = await db.runTransaction(async (tx) => {
            const linkSnap = await tx.get(linkRef);
            const prev = (linkSnap.exists ? linkSnap.data()?.status : null) ?? 'none';
            const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
            // Only an active or pending link needs a write; everything else is a
            // no-op success so repeated calls stay idempotent.
            if (prev === 'active' || prev === 'pending') {
                tx.set(linkRef, { status: 'inactive', updatedAt: now }, { merge: true });
                tx.set(profileRef, { trainerId: null, trainerStatus: null, updatedAt: now }, { merge: true });
            }
            return prev;
        });
        return { ok: true, previousStatus, status: 'inactive' };
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
    async setSharing(studentUid, patch) {
        const profile = await profileRepository_js_1.profileRepository.get(studentUid);
        const current = profile?.trainerSharing ?? {};
        const nextMap = {};
        for (const [key, value] of Object.entries(current)) {
            if (typeof value === 'boolean')
                nextMap[key] = value;
        }
        for (const [key, value] of Object.entries(patch)) {
            if (typeof value === 'boolean')
                nextMap[key] = value;
        }
        const update = {
            trainerSharing: nextMap,
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        };
        // Keep the legacy boolean in sync whenever progressPhotos is set, so any
        // reader still on shareProgressWithTrainer observes the same intent.
        if (typeof patch.progressPhotos === 'boolean') {
            update.shareProgressWithTrainer = patch.progressPhotos;
        }
        const saved = await profileRepository_js_1.profileRepository.upsert(studentUid, update);
        return resolveSharing(saved);
    }
}
exports.StudentService = StudentService;
exports.studentService = new StudentService();
//# sourceMappingURL=studentService.js.map