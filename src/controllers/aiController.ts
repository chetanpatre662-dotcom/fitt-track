import type { Request, Response } from 'express';
import { requireUid } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';
import { aiConversationRepository } from '../repositories/aiConversationRepository.js';
import { ok } from '../utils/http.js';
import type {
  ChatInput,
  GenerateWorkoutInput,
  SubstitutionRequestInput,
  WorkoutRecoInput,
} from '../validators/aiValidators.js';

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

  const reply = await aiService.chat(uid, message, history);

  // Persist both turns (best-effort — do not fail the response if this errors).
  await aiConversationRepository.addMessage(uid, convId, 'user', message).catch(() => {});
  await aiConversationRepository.addMessage(uid, convId, 'assistant', reply).catch(() => {});

  ok(res, { conversationId: convId, reply });
}
