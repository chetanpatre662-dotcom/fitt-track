/**
 * Filters a list of AI-recommended exercise entries, keeping only those whose
 * exerciseId exists in the provided set of valid ids. Prevents the model from
 * inventing exercise IDs. Pure + testable.
 */
export function keepValidExerciseIds<T extends { exerciseId: string }>(
  items: T[],
  validIds: Set<string>,
): T[] {
  return items.filter((item) => validIds.has(item.exerciseId));
}
