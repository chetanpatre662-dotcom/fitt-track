import { personalRecordRepository, type PersonalRecord } from '../repositories/personalRecordRepository.js';
import type { WorkoutExerciseData } from '../utils/workoutCalc.js';
import { derivePrCandidates, isNewRecord } from '../utils/prCalc.js';
import { logger } from '../utils/logger.js';

export interface NewPr {
  exerciseId: string;
  recordType: string;
  value: number;
  previousValue: number | null;
}

/**
 * Detects and persists personal records after a workout is completed.
 * Returns the list of NEW records so the caller can surface a notification.
 * Never throws to the caller path — PR detection is best-effort and must not
 * block workout completion.
 */
export class PersonalRecordService {
  async detectAndRecord(
    uid: string,
    workoutId: string,
    exercises: WorkoutExerciseData[],
  ): Promise<NewPr[]> {
    const newPrs: NewPr[] = [];
    try {
      const candidates = derivePrCandidates(exercises);
      for (const c of candidates) {
        const existing = await personalRecordRepository.getBest(uid, c.exerciseId, c.recordType);
        const prevValue = existing?.value ?? null;
        if (isNewRecord(c.value, prevValue)) {
          const record: PersonalRecord = {
            exerciseId: c.exerciseId,
            recordType: c.recordType,
            value: c.value,
            reps: c.reps ?? null,
            weightKg: c.weightKg ?? null,
            workoutId,
          };
          await personalRecordRepository.upsertBest(uid, record);
          newPrs.push({
            exerciseId: c.exerciseId,
            recordType: c.recordType,
            value: c.value,
            previousValue: prevValue,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, uid, workoutId }, 'PR detection failed (non-fatal)');
    }
    return newPrs;
  }

  async listAll(uid: string): Promise<PersonalRecord[]> {
    return personalRecordRepository.listAll(uid);
  }

  async listForExercise(uid: string, exerciseId: string): Promise<PersonalRecord[]> {
    return personalRecordRepository.listForExercise(uid, exerciseId);
  }
}

export const personalRecordService = new PersonalRecordService();
