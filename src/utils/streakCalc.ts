/**
 * Computes the current morning-challenge streak: the number of consecutive
 * days (ending today or yesterday) that have at least one SUCCESSFUL game
 * result. Distinct successful `dateKey`s are considered.
 */
export function computeStreak(successDateKeys: string[], today: Date = new Date()): number {
  if (successDateKeys.length === 0) return 0;
  const set = new Set(successDateKeys);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
      .getDate()
      .toString()
      .padStart(2, '0')}`;

  // Streak may end today or yesterday (user might not have woken yet today).
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(fmt(cursor))) return 0;
  }

  let streak = 0;
  while (set.has(fmt(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
