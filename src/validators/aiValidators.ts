import { z } from 'zod';
import { MUSCLE_GROUPS, WORKOUT_LOCATIONS } from '../models/domain.js';

export const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().max(200).optional(),
});

export const workoutRecoSchema = z.object({
  location: z.enum(WORKOUT_LOCATIONS).optional(),
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
});

export const generateWorkoutSchema = z.object({
  location: z.enum(WORKOUT_LOCATIONS),
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  durationMinutes: z.number().int().min(10).max(180).optional(),
});

export const substitutionRequestSchema = z.object({
  exerciseId: z.string().min(1).max(200),
});

/** Path param for fetching a single conversation's messages. */
export const conversationIdParamsSchema = z.object({
  id: z.string().min(1).max(200),
});

export type ChatInput = z.infer<typeof chatSchema>;
export type WorkoutRecoInput = z.infer<typeof workoutRecoSchema>;
export type GenerateWorkoutInput = z.infer<typeof generateWorkoutSchema>;
export type SubstitutionRequestInput = z.infer<typeof substitutionRequestSchema>;
