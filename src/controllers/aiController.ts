import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';
import { dailyPlanService } from '../services/dailyPlanService.js';
import { aiConversationRepository } from '../repositories/aiConversationRepository.js';
import { ok } from '../utils/http.js';
import type {
  ChatInput,
  GenerateWorkoutInput,
  SubstitutionRequestInput,
  WorkoutRecoInput,
} from '../validators/aiValidators.js';
import type { DailyPlanGenerateInput, DailyPlanUpdateInput } from '../validators/dailyPlanValidators.js';

export async function dailyInsight(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const insight = await aiService.dailyInsight(uid);
  ok(res, { insight });
}

export async function workoutRecommendation(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const body = req.body as WorkoutRecoInput;
  const recommendation = await aiService.workoutRecommendation({ uid, ...body });
  ok(res, { recommendation });
}

export async function generateWorkout(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const body = req.body as GenerateWorkoutInput;
  const recommendation = await aiService.generateWorkout({ uid, ...body });
  ok(res, { recommendation });
}

export async function nutritionRecommendation(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const recommendation = await aiService.nutritionRecommendation(uid);
  ok(res, { recommendation });
}

export async function exerciseSubstitution(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { exerciseId } = req.body as SubstitutionRequestInput;
  const result = await aiService.exerciseSubstitution({ uid, exerciseId });
  ok(res, { result });
}

export async function recovery(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const result = await aiService.recovery(uid);
  ok(res, { result });
}

export async function progressAnalysis(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const result = await aiService.progressAnalysis(uid);
  ok(res, { result });
}

export async function chat(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { message, conversationId } = req.body as ChatInput;

  const convId = await aiConversationRepository.ensureConversation(uid, conversationId);
  const history = await aiConversationRepository.recentMessages(uid, convId, 8);

  // Feed the single persisted daily plan into chat so it references the SAME
  // plan the Plans screen shows (never a contradictory one). Best-effort.
  const currentPlan = await dailyPlanService.get(uid).catch(() => null);
  const todaysPlan = await dailyPlanService.summarizeForChat(uid).catch(() => null);

  const reply = await aiService.chat(uid, message, history, todaysPlan);

  // Detect (but DO NOT apply) a workout-plan modification request. When found,
  // we return a structured proposal the client confirms before persisting via
  // the existing daily-plan update endpoint — chat never silently mutates the
  // plan. Best-effort: failure falls back to a normal chat reply.
  const detection = await aiService
    .detectPlanModification(message, (currentPlan?.muscleGroups as string[] | undefined) ?? [])
    .catch(() => ({ isModification: false, muscleGroups: [] as string[] }));

  const proposedPlanChange = detection.isModification
    ? { muscleGroups: detection.muscleGroups }
    : null;

  // Persist both turns (best-effort — do not fail the response if this errors).
  await aiConversationRepository.addMessage(uid, convId, 'user', message).catch(() => {});
  await aiConversationRepository.addMessage(uid, convId, 'assistant', reply).catch(() => {});

  ok(res, { conversationId: convId, reply, proposedPlanChange });
}

// --- Daily plan (single source of truth for "today's workout") ---

export async function getDailyPlan(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const { date } = req.query as { date?: string };
  const plan = await dailyPlanService.get(uid, date);
  ok(res, { plan });
}

export async function generateDailyPlan(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const plan = await dailyPlanService.generate(uid, req.body as DailyPlanGenerateInput);
  ok(res, { plan });
}

export async function updateDailyPlan(req: Request, res: Response): Promise<void> {
  const uid = requireUid(req);
  const plan = await dailyPlanService.update(uid, req.body as DailyPlanUpdateInput);
  ok(res, { plan });
}
