import { hasFirebaseCredentials } from '../config/env.js';
import { EXERCISE_CATEGORIES, EXERCISES } from '../data/exerciseSeed.js';
import { FOODS } from '../data/foodSeed.js';
import { exerciseRepository } from '../repositories/exerciseRepository.js';
import { getFirestore, admin } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

/**
 * Seeds the global `exercises` collection (and `exerciseCategories`) from the
 * bundled dataset using the Firebase Admin SDK (bypasses client rules).
 *
 * Usage: npm run seed
 * Requires Firebase Admin credentials (see .env.example / docs/SETUP.md).
 */
async function main(): Promise<void> {
  if (!hasFirebaseCredentials()) {
    logger.error(
      'Cannot seed: Firebase Admin credentials are not configured. ' +
        'Set FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS. See docs/SETUP.md.',
    );
    process.exitCode = 1;
    return;
  }

  logger.info(`Seeding ${EXERCISES.length} exercises...`);
  const written = await exerciseRepository.upsertMany(EXERCISES);
  logger.info(`Upserted ${written} exercises.`);

  // Seed category reference docs.
  const db = getFirestore();
  const batch = db.batch();
  for (const category of EXERCISE_CATEGORIES) {
    const count = EXERCISES.filter((e) => e.category === category).length;
    batch.set(
      db.collection('exerciseCategories').doc(category),
      { id: category, exerciseCount: count, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  logger.info(`Upserted ${EXERCISE_CATEGORIES.length} exercise categories.`);

  // Seed the global foods reference collection.
  logger.info(`Seeding ${FOODS.length} foods...`);
  const foodBatch = db.batch();
  for (const food of FOODS) {
    foodBatch.set(db.collection('foods').doc(food.id), food, { merge: true });
  }
  await foodBatch.commit();
  logger.info(`Upserted ${FOODS.length} foods.`);

  logger.info('Seed complete.');
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exitCode = 1;
});
