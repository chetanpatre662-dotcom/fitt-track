"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exerciseService = exports.ExerciseService = void 0;
const env_js_1 = require("../config/env.js");
const exerciseSeed_js_1 = require("../data/exerciseSeed.js");
const exerciseRepository_js_1 = require("../repositories/exerciseRepository.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
/**
 * Exercise library service. Loads from Firestore when configured, otherwise
 * uses the bundled seed so the library is always usable. Applies COMBINABLE
 * filters and keyword search in-memory (the library is small and fully cached
 * client-side too, so this is fast and avoids many Firestore composite-index
 * round-trips).
 */
class ExerciseService {
    cache = null;
    cacheAt = 0;
    static TTL_MS = 5 * 60 * 1000;
    async load() {
        const fresh = this.cache && Date.now() - this.cacheAt < ExerciseService.TTL_MS;
        if (fresh)
            return this.cache;
        if ((0, env_js_1.hasFirebaseCredentials)()) {
            try {
                const fromDb = await exerciseRepository_js_1.exerciseRepository.getAll();
                if (fromDb.length > 0) {
                    this.cache = fromDb;
                    this.cacheAt = Date.now();
                    return fromDb;
                }
                logger_js_1.logger.warn('exercises collection is empty; serving bundled seed. Run `npm run seed`.');
            }
            catch (err) {
                logger_js_1.logger.warn({ err }, 'Failed to read exercises from Firestore; serving bundled seed.');
            }
        }
        this.cache = exerciseSeed_js_1.EXERCISES;
        this.cacheAt = Date.now();
        return exerciseSeed_js_1.EXERCISES;
    }
    async getById(id) {
        // Try cache/seed first, then Firestore directly.
        const all = await this.load();
        const found = all.find((e) => e.id === id);
        if (found)
            return found;
        if ((0, env_js_1.hasFirebaseCredentials)()) {
            const fromDb = await exerciseRepository_js_1.exerciseRepository.getById(id);
            if (fromDb)
                return fromDb;
        }
        throw new errors_js_1.NotFoundError(`Exercise not found: ${id}`);
    }
    /** Applies combinable filters + optional keyword search, then paginates. */
    async list(filters) {
        const all = await this.load();
        const filtered = ExerciseService.applyFilters(all, filters);
        const offset = Math.max(0, filters.offset ?? 0);
        const limit = filters.limit ?? filtered.length;
        const items = filtered.slice(offset, offset + limit);
        return { items, total: filtered.length };
    }
    /**
     * Pure, testable filter function. All predicates combine with AND.
     * `location: 'both'` exercises always match a home/gym location filter.
     */
    static applyFilters(all, f) {
        const q = f.q?.trim().toLowerCase();
        return all.filter((e) => {
            if (f.location && f.location !== 'all') {
                // An exercise tagged 'both' is available in home AND gym.
                if (e.location !== f.location && e.location !== 'both')
                    return false;
            }
            if (f.muscle && f.muscle !== 'all') {
                const inPrimaryOrSecondary = e.primaryMuscle === f.muscle || e.secondaryMuscles.includes(f.muscle);
                if (!inPrimaryOrSecondary)
                    return false;
            }
            if (f.equipment) {
                if (!e.equipment.includes(f.equipment))
                    return false;
            }
            if (f.difficulty && f.difficulty !== 'all') {
                if (e.difficulty !== f.difficulty)
                    return false;
            }
            if (f.type && f.type !== 'all') {
                if (e.type !== f.type)
                    return false;
            }
            if (q) {
                const haystack = [e.name, e.primaryMuscle, ...e.secondaryMuscles, ...e.keywords]
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q))
                    return false;
            }
            return true;
        });
    }
}
exports.ExerciseService = ExerciseService;
exports.exerciseService = new ExerciseService();
//# sourceMappingURL=exerciseService.js.map