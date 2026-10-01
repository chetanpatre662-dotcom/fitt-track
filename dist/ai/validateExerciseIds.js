"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keepValidExerciseIds = keepValidExerciseIds;
/**
 * Filters a list of AI-recommended exercise entries, keeping only those whose
 * exerciseId exists in the provided set of valid ids. Prevents the model from
 * inventing exercise IDs. Pure + testable.
 */
function keepValidExerciseIds(items, validIds) {
    return items.filter((item) => validIds.has(item.exerciseId));
}
//# sourceMappingURL=validateExerciseIds.js.map