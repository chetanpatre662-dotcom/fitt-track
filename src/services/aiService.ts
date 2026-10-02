import { generateJson, generateText } from '../ai/geminiClient.js';
import { keepValidExerciseIds } from '../ai/validateExerciseIds.js';
import { SAFETY_SYSTEM_PROMPT, contextBlock } from '../ai/prompts.js';
import {
  dailyInsightSchema,
  geminiSchemas,
  nutritionRecommendationSchema,
  planModificationSchema,
  progressAnalysisSchema,
  recoverySchema,
  substitutionSchema,
  workoutRecommendationSchema,
  type WorkoutRecommendation,
} from '../ai/schemas.js';
import { MUSCLE_GROUPS, type MuscleGroup, type WorkoutLocation } from '../models/domain.js';
import { aiContextService } from './aiContextService.js';
import { exerciseService } from './exerciseService.js';
import { logger } from '../utils/logger.js';

/** Local date key (yyyy-MM-dd). */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * AI Coach business logic. Builds compact context, calls Gemini for structured
 * JSON, validates responses (Zod) and exercise IDs (against the library), and
 * returns validated results. Never auto-modifies user records — the app asks
 * the user to confirm before applying any recommendation.
 */
export class AiService {
  async dailyInsight(uid: string) {
    const [user, workouts, nutrition] = await Promise.all([
      aiContextService.userContext(uid),
      aiContextService.recentWorkouts(uid, 4),
      aiContextService.todayNutrition(uid, todayKey()),
    ]);

    const prompt = [
      'Write a short (2-3 sentence) personalized daily insight for the user.',
      contextBlock('USER', user),
      contextBlock('RECENT_WORKOUTS', workouts),
      contextBlock('TODAY_NUTRITION', nutrition),
      'Return JSON: { "insight": string, "focus": string }',
    ].join('\n\n');

    try {
      const raw = await generateJson({
        systemInstruction: SAFETY_SYSTEM_PROMPT,
        prompt,
        responseSchema: geminiSchemas.dailyInsight,
        temperature: 0.8,
      });
      return dailyInsightSchema.parse(raw);
    } catch (err) {
      logger.warn({ err }, 'dailyInsight fallback');
      return {
        insight: workouts.length === 0
          ? 'Ready to start? A short workout today builds momentum toward your goal.'
          : 'Nice consistency lately — keep your protein and water on target today.',
        focus: '',
      };
    }
  }

  async workoutRecommendation(params: {
    uid: string;
    location?: WorkoutLocation;
    muscle?: MuscleGroup;
    durationMinutes?: number;
  }): Promise<WorkoutRecommendation> {
    const { uid } = params;
    const [user, recency, candidates] = await Promise.all([
      aiContextService.userContext(uid),
      aiContextService.muscleRecency(uid),
      aiContextService.candidateExercises({
        location: params.location,
        muscle: params.muscle,
        equipment: (await aiContextService.userContext(uid)).equipment as string[] | undefined,
        limit: 40,
      }),
    ]);

    const validIds = new Set(candidates.map((c) => c.id));

    const prompt = [
      `Recommend a ${params.durationMinutes ?? 45}-minute workout${params.muscle ? ` focused on ${params.muscle}` : ''}.`,
      'Consider the user\'s goal, level, equipment, and recently trained muscles (avoid overtraining muscles trained in the last ~2 days).',
      'Pick exercises ONLY from CANDIDATES using their exact "id" as exerciseId. Never invent ids.',
      contextBlock('USER', user),
      contextBlock('MUSCLE_LAST_TRAINED', recency),
      contextBlock('CANDIDATES', candidates),
    ].join('\n\n');

    const raw = await generateJson({
      systemInstruction: SAFETY_SYSTEM_PROMPT,
      prompt,
      responseSchema: geminiSchemas.workoutRecommendation,
      temperature: 0.6,
    });
    const parsed = workoutRecommendationSchema.parse(raw);
    // Drop any invented exercise IDs.
    parsed.exercises = keepValidExerciseIds(parsed.exercises, validIds);
    if (parsed.exercises.length === 0) {
      // Safe fallback: build from top candidates.
      parsed.exercises = candidates.slice(0, 5).map((c) => ({
        exerciseId: c.id,
        sets: 3,
        repMin: 8,
        repMax: 12,
        restSeconds: 90,
        reason: 'Matched to your equipment and target.',
      }));
    }
    return parsed;
  }

  async generateWorkout(params: {
    uid: string;
    location: WorkoutLocation;
    muscle?: MuscleGroup;
    durationMinutes?: number;
  }) {
    return this.workoutRecommendation(params);
  }

  async nutritionRecommendation(uid: string) {
    const [user, nutrition, workouts] = await Promise.all([
      aiContextService.userContext(uid),
      aiContextService.todayNutrition(uid, todayKey()),
      aiContextService.recentWorkouts(uid, 2),
    ]);

    const prompt = [
      'Given the user\'s goal, today\'s intake vs targets, and recent training, suggest practical foods for the rest of today.',
      'General guidance only — no medical advice, no extreme dieting.',
      contextBlock('USER', user),
      contextBlock('TODAY_NUTRITION', nutrition),
      contextBlock('RECENT_WORKOUTS', workouts),
    ].join('\n\n');

    try {
      const raw = await generateJson({
        systemInstruction: SAFETY_SYSTEM_PROMPT,
        prompt,
        responseSchema: geminiSchemas.nutritionRecommendation,
        temperature: 0.7,
      });
      return nutritionRecommendationSchema.parse(raw);
    } catch (err) {
      logger.warn({ err }, 'nutritionRecommendation fallback');
      return {
        summary: 'Aim to hit your remaining protein target with a balanced meal (protein + carbs + vegetables).',
        suggestions: [],
      };
    }
  }

  async exerciseSubstitution(params: { uid: string; exerciseId: string }) {
    const original = await exerciseService.getById(params.exerciseId);
    const user = await aiContextService.userContext(params.uid);
    const candidates = await aiContextService.candidateExercises({
      muscle: original.primaryMuscle,
      equipment: user.equipment as string[] | undefined,
      limit: 30,
    });
    const validIds = new Set(candidates.map((c) => c.id));

    const prompt = [
      `Suggest up to 4 alternative exercises for "${original.name}" (${original.primaryMuscle}).`,
      'Use ONLY ids from CANDIDATES. Consider the user\'s available equipment.',
      contextBlock('USER', user),
      contextBlock('ORIGINAL', { id: original.id, name: original.name, primaryMuscle: original.primaryMuscle }),
      contextBlock('CANDIDATES', candidates),
    ].join('\n\n');

    const raw = await generateJson({
      systemInstruction: SAFETY_SYSTEM_PROMPT,
      prompt,
      responseSchema: geminiSchemas.substitution,
      temperature: 0.5,
    });
    const parsed = substitutionSchema.parse(raw);
    parsed.alternatives = keepValidExerciseIds(parsed.alternatives, validIds).filter(
      (a) => a.exerciseId !== params.exerciseId,
    );
    return parsed;
  }

  async recovery(uid: string) {
    const [user, recency] = await Promise.all([
      aiContextService.userContext(uid),
      aiContextService.muscleRecency(uid),
    ]);
    const prompt = [
      'Given recently trained muscles, advise which muscle groups are ready to train and which should rest today.',
      'This is a fitness-planning heuristic, not medical advice.',
      contextBlock('USER', user),
      contextBlock('MUSCLE_LAST_TRAINED', recency),
    ].join('\n\n');
    try {
      const raw = await generateJson({
        systemInstruction: SAFETY_SYSTEM_PROMPT,
        prompt,
        responseSchema: geminiSchemas.recovery,
        temperature: 0.5,
      });
      return recoverySchema.parse(raw);
    } catch (err) {
      logger.warn({ err }, 'recovery fallback');
      return { summary: 'Rotate muscle groups and allow ~48h before training the same group again.', recommendedFocusMuscles: [], musclesToRest: [] };
    }
  }

  async progressAnalysis(uid: string) {
    const workouts = await aiContextService.recentWorkouts(uid, 10);
    const prompt = [
      'Analyze the user\'s recent training trend (volume, frequency, consistency) and give brief highlights + suggestions.',
      contextBlock('RECENT_WORKOUTS', workouts),
    ].join('\n\n');
    try {
      const raw = await generateJson({
        systemInstruction: SAFETY_SYSTEM_PROMPT,
        prompt,
        responseSchema: geminiSchemas.progressAnalysis,
        temperature: 0.6,
      });
      return progressAnalysisSchema.parse(raw);
    } catch (err) {
      logger.warn({ err }, 'progressAnalysis fallback');
      return {
        summary: workouts.length === 0
          ? 'No completed workouts yet — log a few to unlock trend analysis.'
          : 'Keep logging workouts to see richer progress trends.',
        highlights: [],
        suggestions: [],
      };
    }
  }

  /**
   * Free-form chat with the user's compact context. Returns plain text.
   *
   * [todaysPlan] is a compact summary of the SINGLE persisted daily workout
   * plan (see dailyPlanService). When present, the coach must reference THAT
   * plan for "what should I train today?" rather than inventing a new one, so
   * Chat and the Plans screen never disagree.
   */
  async chat(
    uid: string,
    message: string,
    history: Array<{ role: string; text: string }> = [],
    todaysPlan?: string | null,
  ) {
    const [user, workouts, nutrition] = await Promise.all([
      aiContextService.userContext(uid),
      aiContextService.recentWorkouts(uid, 3),
      aiContextService.todayNutrition(uid, todayKey()),
    ]);

    const historyText = history
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`)
      .join('\n');

    const prompt = [
      contextBlock('USER', user),
      contextBlock('RECENT_WORKOUTS', workouts),
      contextBlock('TODAY_NUTRITION', nutrition),
      todaysPlan
        ? `TODAYS_WORKOUT_PLAN (the single source of truth — reference THIS plan for "what should I train today"; do not invent a different workout):\n${todaysPlan}`
        : 'TODAYS_WORKOUT_PLAN: none yet. If the user asks what to train, you may propose one; the app will save it as today\'s plan.',
      historyText ? `CONVERSATION SO FAR:\n${historyText}` : '',
      `User: ${message}`,
      'Reply helpfully and concisely as their coach. If a workout plan exists above, base any training answer on it.',
    ]
      .filter(Boolean)
      .join('\n\n');

    return generateText({ systemInstruction: SAFETY_SYSTEM_PROMPT, prompt, temperature: 0.85 });
  }

  /**
   * Detects whether a chat message is asking to CHANGE today's workout plan and,
   * if so, which muscle groups the user wants. Uses structured JSON output and
   * strictly re-validates the muscle groups against MUSCLE_GROUPS, so the result
   * is safe to turn into a confirmable proposal (never silently applied).
   *
   * Returns { isModification: false } on any ambiguity or AI error — i.e. it
   * fails safe toward "not a modification" so normal chat is never disrupted.
   */
  async detectPlanModification(
    message: string,
    currentMuscleGroups: string[] = [],
  ): Promise<{ isModification: boolean; muscleGroups: MuscleGroup[] }> {
    const allowed = MUSCLE_GROUPS.join(', ');
    const prompt = [
      'Decide if the user is asking to CHANGE/replace today\'s workout plan (the muscle groups to train).',
      'Examples of modification: "only back and biceps", "remove chest add shoulders", "make today legs only".',
      'Examples that are NOT modification: "what should I train today?", "how many sets?", "is this plan good?".',
      `The ONLY valid muscle group values are: ${allowed}. Map the user's words to these (e.g. "abs"->core).`,
      `CURRENT_PLAN_MUSCLES: ${currentMuscleGroups.join(', ') || '(none)'}`,
      `User message: ${message}`,
      'Return JSON: { "isModification": boolean, "muscleGroups": string[] } where muscleGroups is the FULL desired set after the change (only used when isModification is true).',
    ].join('\n\n');

    try {
      const raw = await generateJson({
        systemInstruction: SAFETY_SYSTEM_PROMPT,
        prompt,
        responseSchema: geminiSchemas.planModification,
        temperature: 0,
      });
      const parsed = planModificationSchema.parse(raw);
      // Strictly keep only valid muscle groups; drop anything invented.
      const valid = (MUSCLE_GROUPS as readonly string[]);
      const muscleGroups = [...new Set(parsed.muscleGroups)].filter((m): m is MuscleGroup =>
        valid.includes(m),
      );
      // Only a real modification if we have at least one valid target muscle.
      const isModification = parsed.isModification && muscleGroups.length > 0;
      return { isModification, muscleGroups };
    } catch (err) {
      logger.warn({ err }, 'detectPlanModification fallback (treating as non-modification)');
      return { isModification: false, muscleGroups: [] };
    }
  }
}

export const aiService = new AiService();
