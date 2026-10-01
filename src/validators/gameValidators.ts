import { z } from 'zod';

const GAME_IDS = [
  'memoryMatch',
  'quickMath',
  'numberSequence',
  'patternMemory',
  'reactionTest',
  'quickTap',
  'colorShapeMemory',
  'wordScramble',
  'logicPuzzle',
  'simon',
] as const;

export const gameResultSchema = z.object({
  gameId: z.enum(GAME_IDS),
  success: z.boolean(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  score: z.number().int().min(0).max(1_000_000),
  durationSeconds: z.number().int().min(0).max(86_400),
  attempts: z.number().int().min(0).max(10_000),
  alarmId: z.number().int().optional().nullable(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});

export type GameResultInput = z.infer<typeof gameResultSchema>;
