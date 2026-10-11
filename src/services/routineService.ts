import { admin } from '../config/firebase.js';
import { routineRepository } from '../repositories/routineRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { completionPercent } from '../utils/routineCalc.js';
import {
  STREAK_LOOKBACK_DAYS,
  buildMonthDays,
  fmt,
  monthBounds,
  qualifyingStreaks,
  requiredRoutinesForDay,
} from '../utils/routineCalendarCalc.js';
import type { RoutineUpsertInput } from '../validators/routineValidators.js';

export class RoutineService {
  async list(uid: string): Promise<Record<string, unknown>[]> {
    return routineRepository.list(uid);
  }

  async create(uid: string, input: RoutineUpsertInput): Promise<Record<string, unknown>> {
    const id = routineRepository.newId(uid);
    return routineRepository.set(uid, id, {
      ...input,
      description: input.description ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async update(uid: string, id: string, input: RoutineUpsertInput): Promise<Record<string, unknown>> {
    const existing = await routineRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Routine not found');
    return routineRepository.set(uid, id, { ...input, description: input.description ?? null });
  }

  async delete(uid: string, id: string): Promise<void> {
    const existing = await routineRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Routine not found');
    await routineRepository.delete(uid, id);
    // Hard-delete the definition only. Completion history is intentionally
    // PRESERVED so past days' calendar state + the streak stay correct
    // (design §9). `deleteCompletionsForRoutine` remains for account-wipe.
  }

  async setCompletion(uid: string, id: string, dateKey: string, status: string): Promise<Record<string, unknown>> {
    const existing = await routineRepository.get(uid, id);
    if (!existing) throw new NotFoundError('Routine not found');
    return routineRepository.setCompletion(uid, dateKey, id, status);
  }

  /**
   * Returns the routines scheduled for a given date with their completion
   * status, plus the day's completion percentage.
   */
  async getDay(uid: string, dateKey: string) {
    const [routines, completions] = await Promise.all([
      routineRepository.list(uid),
      routineRepository.listCompletionsByDate(uid, dateKey),
    ]);

    const statusByRoutine = new Map<string, string>();
    for (const c of completions) {
      statusByRoutine.set(c.routineId as string, (c.status as string) ?? 'pending');
    }

    // Filter the task list through the shared required-set helper so the
    // day-detail list gains the createdAt<=dateKey carve-out and can never
    // diverge from the calendar aggregator (design §6.1, Finding #2).
    const scheduled = requiredRoutinesForDay(routines, dateKey).map((r) => ({
      ...r,
      status: statusByRoutine.get(r.id as string) ?? 'pending',
    }));

    const completedCount = scheduled.filter((r) => r.status === 'completed').length;

    return {
      dateKey,
      routines: scheduled,
      total: scheduled.length,
      completed: completedCount,
      completionPercent: completionPercent(scheduled.length, completedCount),
    };
  }

  /**
   * Per-day aggregate state for a month + the current/best routine streak.
   * Bounded to <=3 Firestore reads (design §6): 1 × list + 2 × range reads
   * (one for the month grid, one for the 366-day streak window). No per-day
   * `getDay` fan-out.
   */
  async getMonth(uid: string, year: number, month: number) {
    const { start, end } = monthBounds(year, month);

    // Server-local today for past/present/future classification.
    const today = fmt(new Date());
    // Streak window start = today - (lookback - 1) days (local arithmetic).
    const windowStartDate = new Date();
    windowStartDate.setDate(windowStartDate.getDate() - (STREAK_LOOKBACK_DAYS - 1));
    const windowStart = fmt(windowStartDate);

    const [routines, monthCompletions, streakCompletions] = await Promise.all([
      routineRepository.list(uid),
      routineRepository.listCompletionsInRange(uid, start, end),
      routineRepository.listCompletionsInRange(uid, windowStart, today),
    ]);

    const days = buildMonthDays(routines, monthCompletions, year, month, today);
    const streak = qualifyingStreaks(routines, streakCompletions, today, STREAK_LOOKBACK_DAYS);

    return { year, month, days, streak };
  }
}

export const routineService = new RoutineService();
