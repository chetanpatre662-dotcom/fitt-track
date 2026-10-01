"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_js_1 = require("../config/env.js");
const exerciseSeed_js_1 = require("../data/exerciseSeed.js");
const foodSeed_js_1 = require("../data/foodSeed.js");
const exerciseRepository_js_1 = require("../repositories/exerciseRepository.js");
const firebase_js_1 = require("../config/firebase.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Seeds the global `exercises` collection (and `exerciseCategories`) from the
 * bundled dataset using the Firebase Admin SDK (bypasses client rules).
 *
 * Usage: npm run seed
 * Requires Firebase Admin credentials (see .env.example / docs/SETUP.md).
 */
async function main() {
    if (!(0, env_js_1.hasFirebaseCredentials)()) {
        logger_js_1.logger.error('Cannot seed: Firebase Admin credentials are not configured. ' +
            'Set FIREBASE_* env vars or GOOGLE_APPLICATION_CREDENTIALS. See docs/SETUP.md.');
        process.exitCode = 1;
        return;
    }
    logger_js_1.logger.info(`Seeding ${exerciseSeed_js_1.EXERCISES.length} exercises...`);
    const written = await exerciseRepository_js_1.exerciseRepository.upsertMany(exerciseSeed_js_1.EXERCISES);
    logger_js_1.logger.info(`Upserted ${written} exercises.`);
    // Seed category reference docs.
    const db = (0, firebase_js_1.getFirestore)();
    const batch = db.batch();
    for (const category of exerciseSeed_js_1.EXERCISE_CATEGORIES) {
        const count = exerciseSeed_js_1.EXERCISES.filter((e) => e.category === category).length;
        batch.set(db.collection('exerciseCategories').doc(category), { id: category, exerciseCount: count, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
    logger_js_1.logger.info(`Upserted ${exerciseSeed_js_1.EXERCISE_CATEGORIES.length} exercise categories.`);
    // Seed the global foods reference collection.
    logger_js_1.logger.info(`Seeding ${foodSeed_js_1.FOODS.length} foods...`);
    const foodBatch = db.batch();
    for (const food of foodSeed_js_1.FOODS) {
        foodBatch.set(db.collection('foods').doc(food.id), food, { merge: true });
    }
    await foodBatch.commit();
    logger_js_1.logger.info(`Upserted ${foodSeed_js_1.FOODS.length} foods.`);
    logger_js_1.logger.info('Seed complete.');
}
main().catch((err) => {
    logger_js_1.logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
});
//# sourceMappingURL=seedExercises.js.map