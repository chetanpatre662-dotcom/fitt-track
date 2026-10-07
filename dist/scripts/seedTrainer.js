"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_js_1 = require("../config/env.js");
const firebase_js_1 = require("../config/firebase.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Seeds the initial "Dream Physics" trainer account using the Firebase Admin
 * SDK (bypasses client rules). Idempotent: re-running leaves data unchanged
 * apart from the updatedAt stamp.
 *
 * Writes:
 *   - users/{uid}.role = 'trainer'
 *   - trainers/{uid}   = { name 'Dream Physics', referralCode 'dreamphysics', ... }
 *   - referralCodes/dreamphysics = { trainerId: uid }
 *
 * Usage: SEED_TRAINER_UID=<firebase-auth-uid> npm run seed:trainer
 * Requires Firebase Admin credentials (see docs/SETUP.md). The uid MUST be a
 * real Firebase Auth uid (create the trainer login account first), because the
 * trainer signs in through the same Firebase Authentication as every student.
 */
const REFERRAL_CODE = 'dreamphysics';
const TRAINER_NAME = 'Dream Physics';
async function main() {
    if (!(0, env_js_1.hasFirebaseCredentials)()) {
        logger_js_1.logger.error('Cannot seed trainer: Firebase Admin credentials are not configured. ' +
            'Set FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS. See docs/SETUP.md.');
        process.exitCode = 1;
        return;
    }
    const uid = process.env.SEED_TRAINER_UID?.trim();
    if (!uid) {
        logger_js_1.logger.error('Cannot seed trainer: SEED_TRAINER_UID is required (the Firebase Auth uid of the trainer account). ' +
            'Create the trainer login via Firebase Authentication first, then run: ' +
            'SEED_TRAINER_UID=<uid> npm run seed:trainer');
        process.exitCode = 1;
        return;
    }
    const db = (0, firebase_js_1.getFirestore)();
    const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
    const codeLower = REFERRAL_CODE.toLowerCase();
    // 1. users/{uid}.role = 'trainer' (merge: never clobber other account fields).
    await db.collection('users').doc(uid).set({ role: 'trainer', updatedAt: now }, { merge: true });
    // 2. trainers/{uid}: set createdAt only on first write; always refresh the
    //    descriptive fields. totalStudents is NOT reset here so re-seeding never
    //    zeroes a live counter.
    const trainerRef = db.collection('trainers').doc(uid);
    const existing = await trainerRef.get();
    const base = {
        trainerId: uid,
        name: TRAINER_NAME,
        referralCode: REFERRAL_CODE,
        referralCodeLower: codeLower,
        status: 'active',
        photoUrl: null,
        updatedAt: now,
    };
    if (!existing.exists) {
        base.totalStudents = 0;
        base.createdAt = now;
    }
    await trainerRef.set(base, { merge: true });
    // 3. referralCodes/{codeLower} -> { trainerId: uid }.
    await db.collection('referralCodes').doc(codeLower).set({ trainerId: uid }, { merge: true });
    logger_js_1.logger.info({ uid, referralCode: REFERRAL_CODE }, 'Trainer seed complete.');
}
main().catch((err) => {
    logger_js_1.logger.error({ err }, 'Trainer seed failed');
    process.exitCode = 1;
});
//# sourceMappingURL=seedTrainer.js.map