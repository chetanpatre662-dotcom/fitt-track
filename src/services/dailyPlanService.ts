import type { MuscleGroup, WorkoutLocation } from '../models/domain.js';
import { dailyPlanRepository } from '../repositories/dailyPlanRepository.js';
import { aiService } from './aiService.js';
import { exerciseService } from './exerciseService.js';
import type { WorkoutRecommendation } from '../ai/schemas.js';
import type { DailyPlanGenerateInput, DailyPlanUpdateInput } from '../validators/dailyPlanValidators.js';

export type PlanSource = 'ai' | 'user_modified';

interface PlanExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  reason: string;
}

interface StructuredPlan {
  title: string;
  goal: string;
  durationMinutes: number;
  muscleGroups: string[];
  exercises: PlanExercise[];
  notes: string;
  source: PlanSource;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * The single source of truth for a user's "today's workout".
 *
 * Both the Plans screen and the AI Chat go through this service, so they always
 * reflect the same persisted structured plan. Exercise selection reuses the
 * existing AI recommendation engine (which validates exercise ids), and muscle
 * groups are derived from the chosen exercises via the exercise library so the
 * stored plan is trustworthy and renderable without the AI.
 */
export class DailyPlanService {
  /** Derives distinct primary muscle groups from the plan's exercises. */
  private async deriveMuscleGroups(exerciseIds: string[]): Promise<string[]> {
    const muscles = new Set<string>();
    for (const id of exerciseIds) {
      try {
        const ex = await exerciseService.getById(id);
        if (ex.primaryMuscle) muscles.add(ex.primaryMuscle);
      } catch {
        // Skip ids that can't be resolved (keepValidExerciseIds already filters,
        // but be defensive).
      }
    }
    return [...muscles];
  }

  private async toStructuredPlan(
    rec: WorkoutRecommendation,
    source: PlanSource,
    overrideMuscles?: string[],
  ): Promise<StructuredPlan> {
    const exercises: PlanExercise[] = rec.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      restSeconds: e.restSeconds,
      reason: e.reason ?? '',
    }));
    const muscleGroups =
      overrideMuscles ?? (await this.deriveMuscleGroups(exercises.map((e) => e.exerciseId)));
    return {
      title: rec.title,
      goal: rec.goal,
      durationMinutes: rec.durationMinutes,
      muscleGroups,
      exercises,
      notes: rec.notes ?? '',
      source,
    };
  }

  /** Returns today's (or the given date's) plan, generating + persisting once if absent. */
  async getOrCreate(
    uid: string,
    dateKey: string = todayKey(),
    opts: { location?: WorkoutLocation; muscle?: MuscleGroup; durationMinutes?: number } = {},
  ): Promise<Record<string, unknown>> {
    const existing = await dailyPlanRepository.get(uid, dateKey);
    if (existing) return existing;

    const rec = await aiService.workoutRecommendation({
      uid,
      location: opts.location,
      muscle: opts.muscle,
      durationMinutes: opts.durationMinutes,
    });
    const plan = await this.toStructuredPlan(rec, 'ai');
    return dailyPlanRepository.set(uid, dateKey, { ...plan });
  }

  async get(uid: string, dateKey: string = todayKey()): Promise<Record<string, unknown> | null> {
    return dailyPlanRepository.get(uid, dateKey);
  }

  /** Explicit generate (optionally forcing a fresh plan over an existing one). */
  async generate(uid: string, input: DailyPlanGenerateInput): Promise<Record<string, unknown>> {
    const dateKey = input.date ?? todayKey();
    if (!input.force) {
      const existing = await dailyPlanRepository.get(uid, dateKey);
      if (existing) return existing;
    }
    const rec = await aiService.workoutRecommendation({
      uid,
      location: input.location,
      muscle: input.muscle,
      durationMinutes: input.durationMinutes,
    });
    const plan = await this.toStructuredPlan(rec, 'ai');
    return dailyPlanRepository.set(uid, dateKey, { ...plan });
  }

  /**
   * Updates the persisted plan. If explicit `exercises` are given, saves them as
   * a user-modified plan. Otherwise, if `muscleGroups` are given, regenerates
   * exercises focused on the first target muscle (reusing the AI engine) and
   * persists them as user-modified. The result is the single plan for the date.
   */
  async update(uid: string, input: DailyPlanUpdateInput): Promise<Record<string, unknown>> {
    const dateKey = input.date ?? todayKey();
    const existing = await dailyPlanRepository.get(uid, dateKey);

    if (input.exercises && input.exercises.length > 0) {
      const exercises: PlanExercise[] = input.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        restSeconds: e.restSeconds,
        reason: e.reason ?? '',
      }));
      const muscleGroups =
        input.muscleGroups ?? (await this.deriveMuscleGroups(exercises.map((e) => e.exerciseId)));
      const plan: StructuredPlan = {
        title: input.title ?? (existing?.title as string) ?? 'Today\'s workout',
        goal: input.goal ?? (existing?.goal as string) ?? '',
        durationMinutes: input.durationMinutes ?? (existing?.durationMinutes as number) ?? 45,
        muscleGroups,
        exercises,
        notes: input.notes ?? (existing?.notes as string) ?? '',
        source: 'user_modified',
      };
      return dailyPlanRepository.set(uid, dateKey, { ...plan });
    }

    // Regenerate for the requested muscle focus.
    const focus = input.muscleGroups?.[0] as MuscleGroup | undefined;
    const rec = await aiService.workoutRecommendation({
      uid,
      location: input.location,
      muscle: focus,
      durationMinutes: input.durationMinutes,
    });
    // Preserve the user's requested muscle groups as the plan's declared target.
    const plan = await this.toStructuredPlan(rec, 'user_modified', input.muscleGroups);
    return dailyPlanRepository.set(uid, dateKey, { ...plan });
  }

  /**
   * Compact text summary of today's plan for the Chat context, so Chat
   * references the SAME persisted plan instead of inventing its own.
   */
  async summarizeForChat(uid: string, dateKey: string = todayKey()): Promise<string | null> {
    const plan = await dailyPlanRepository.get(uid, dateKey);
    if (!plan) return null;
    const muscles = (plan.muscleGroups as string[] | undefined)?.join(', ') || 'full body';
    const exercises = (plan.exercises as PlanExercise[] | undefined) ?? [];
    const names: string[] = [];
    for (const e of exercises.slice(0, 12)) {
      try {
        const lib = await exerciseService.getById(e.exerciseId);
        names.push(`${lib.name} ${e.sets}x${e.repMin}-${e.repMax}`);
      } catch {
        names.push(`${e.exerciseId} ${e.sets}x${e.repMin}-${e.repMax}`);
      }
    }
    return [
      `title: ${plan.title ?? "Today's workout"}`,
      `muscleGroups: ${muscles}`,
      `durationMinutes: ${plan.durationMinutes ?? 45}`,
      `source: ${plan.source ?? 'ai'}`,
      `exercises: ${names.join('; ')}`,
    ].join('\n');
  }
}

export const dailyPlanService = new DailyPlanService();
