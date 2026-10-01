/**
 * Shared domain types & enums used across services, validators and the AI
 * layer. These mirror the Firestore schema documented in docs/DATABASE.md.
 * The Flutter app has an equivalent set of models; keep them in sync.
 */

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'full_body',
  'cardio',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const WORKOUT_LOCATIONS = ['home', 'gym', 'both'] as const;
export type WorkoutLocation = (typeof WORKOUT_LOCATIONS)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const EXERCISE_TYPES = [
  'strength',
  'hypertrophy',
  'cardio',
  'mobility',
  'bodyweight',
  'hiit',
  'stretching',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EQUIPMENT = [
  'none',
  'dumbbell',
  'barbell',
  'bench',
  'cable',
  'machine',
  'resistance_band',
  'pull_up_bar',
  'kettlebell',
  'treadmill',
  'exercise_bike',
  'elliptical',
  'rowing_machine',
  'jump_rope',
  'squat_rack',
  'ez_bar',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const GOALS = [
  'muscle_gain',
  'fat_loss',
  'weight_loss',
  'weight_gain',
  'maintain_weight',
  'strength',
  'general_fitness',
  'endurance',
  'cardiovascular',
] as const;
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export type Gender = (typeof GENDERS)[number];

export const WORKOUT_STATUSES = ['planned', 'in_progress', 'paused', 'completed', 'cancelled'] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'custom'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const ROUTINE_CATEGORIES = [
  'wake_up',
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'workout',
  'water',
  'sleep',
  'study',
  'work',
  'custom',
] as const;
export type RoutineCategory = (typeof ROUTINE_CATEGORIES)[number];

export const PR_TYPES = ['max_weight', 'max_reps', 'max_volume', 'best_distance', 'best_time'] as const;
export type PrType = (typeof PR_TYPES)[number];

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  category: MuscleGroup;
  location: WorkoutLocation;
  equipment: Equipment[];
  difficulty: Difficulty;
  type: ExerciseType;
  instructions: string[];
  safetyNotes: string[];
  recommendedSets: number;
  recommendedRepMin: number;
  recommendedRepMax: number;
  recommendedRestSeconds: number;
  imageUrl?: string;
  videoUrl?: string;
  keywords: string[];
}
