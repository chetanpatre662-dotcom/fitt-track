import { admin } from '../config/firebase.js';
import { routineRepository } from '../repositories/routineRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { completionPercent, isRoutineOnDate } from '../utils/routineCalc.js';
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
    // Clean up completion history so no stale records linger.
    await routineRepository.deleteCompletionsForRoutine(uid, id);
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

    const scheduled = routines
      .filter((r) => (r.enabled as boolean) !== false)
      .filter((r) => isRoutineOnDate((r.repeatDays as number[]) ?? [], dateKey))
      .map((r) => ({
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
}

export const routineService = new RoutineService();
