import { hasFirebaseCredentials } from '../config/env.js';
import { getFirestore, admin } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

/**
 * One-shot, idempotent migration that folds any pre-existing trainer data into
 * the dynamic multi-trainer referral model WITHOUT disconnecting any students.
 *
 * It backfills the new fields on every trainers/* and referralCodes/* document
 * via the Admin SDK (bypassing client rules). It deliberately does NOT run the
 * format/reserved-word validator, so legacy codes — including the historical
 * `dreamphysics` code — are GRANDFATHERED active exactly as stored. The
 * reserved-word list applies only to NEW claims; it never rejects migration
 * backfill (otherwise the migration would reject its own legacy data).
 *
 * trainerLinks/* are NEVER touched: the trainer<->student relationship is keyed
 * by studentUid -> trainerId and is independent of the code, so normalizing
 * codes cannot disconnect anyone.
 *
 * Idempotent and safe to re-run. Requires Firebase Admin credentials; run
 * manually (never in CI):  npm run migrate:referral-codes
 */
async function main(): Promise<void> {
  if (!hasFirebaseCredentials()) {
    logger.error(
      'Cannot migrate referral codes: Firebase Admin credentials are not configured. ' +
        'Set FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS. See docs/SETUP.md.',
    );
    process.exitCode = 1;
    return;
  }

  const db = getFirestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // 1. Backfill trainers/*.
  const trainersSnap = await db.collection('trainers').get();
  let trainersUpdated = 0;
  for (const doc of trainersSnap.docs) {
    const data = doc.data() ?? {};
    const patch: Record<string, unknown> = { updatedAt: now };

    if (data.userId === undefined) patch.userId = doc.id;
    if (data.createdAt === undefined) patch.createdAt = now;
    if (data.status === undefined) patch.status = 'active';

    const status = (patch.status ?? data.status) as string | undefined;
    patch.active = status === 'active';

    // Normalize the code mirror if a display code exists but the lower form or
    // the updatedAt stamp are missing. Never invents a code where none exists.
    const referralCode = data.referralCode as string | undefined;
    if (referralCode) {
      if (data.referralCodeLower === undefined) {
        patch.referralCodeLower = referralCode.trim().toLowerCase();
      }
      if (data.referralCodeUpdatedAt === undefined) {
        patch.referralCodeUpdatedAt = now;
      }
    }

    await doc.ref.set(patch, { merge: true });
    trainersUpdated += 1;
  }

  // 2. Backfill referralCodes/* (preserve the existing trainerId; grandfather
  //    every existing code as active without validation).
  const codesSnap = await db.collection('referralCodes').get();
  let codesUpdated = 0;
  for (const doc of codesSnap.docs) {
    const data = doc.data() ?? {};
    const patch: Record<string, unknown> = { updatedAt: now };

    // trainerId is authoritative — preserve, never overwrite.
    if (data.code === undefined) patch.code = doc.id;
    if (data.active === undefined) patch.active = true;
    if (data.createdAt === undefined) patch.createdAt = now;

    await doc.ref.set(patch, { merge: true });
    codesUpdated += 1;
  }

  logger.info(
    { trainersUpdated, codesUpdated },
    'Referral-code migration complete (trainerLinks untouched).',
  );
}

main().catch((err) => {
  logger.error({ err }, 'Referral-code migration failed');
  process.exitCode = 1;
});
