"use strict";
/**
 * Shared domain types & enums used across services, validators and the AI
 * layer. These mirror the Firestore schema documented in docs/DATABASE.md.
 * The Flutter app has an equivalent set of models; keep them in sync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRAINER_LINK_STATUSES = exports.PR_TYPES = exports.ROUTINE_CATEGORIES = exports.MEAL_TYPES = exports.WORKOUT_STATUSES = exports.GENDERS = exports.ACTIVITY_LEVELS = exports.GOALS = exports.EQUIPMENT = exports.EXERCISE_TYPES = exports.DIFFICULTIES = exports.WORKOUT_LOCATIONS = exports.MUSCLE_GROUPS = void 0;
exports.MUSCLE_GROUPS = [
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'forearms',
    'legs',
    'glutes',
    'calves',
    'core',
    'full_body',
    'cardio',
];
exports.WORKOUT_LOCATIONS = ['home', 'gym', 'both'];
exports.DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
exports.EXERCISE_TYPES = [
    'strength',
    'hypertrophy',
    'cardio',
    'mobility',
    'bodyweight',
    'hiit',
    'stretching',
];
exports.EQUIPMENT = [
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
    'smith_machine',
];
exports.GOALS = [
    'muscle_gain',
    'fat_loss',
    'weight_loss',
    'weight_gain',
    'maintain_weight',
    'strength',
    'general_fitness',
    'endurance',
    'cardiovascular',
];
exports.ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
exports.GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
exports.WORKOUT_STATUSES = ['planned', 'in_progress', 'paused', 'completed', 'cancelled'];
exports.MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'custom'];
exports.ROUTINE_CATEGORIES = [
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
];
exports.PR_TYPES = ['max_weight', 'max_reps', 'max_volume', 'best_distance', 'best_time'];
/**
 * Lifecycle states for the single trainerLinks/{studentUid} document (one
 * student belongs to at most one trainer, so the doc is reused across state
 * transitions rather than a new collection — the single-trainer invariant is
 * already enforced by the doc being keyed on the student uid).
 *
 *  - 'pending'  = the student sent a connect request; awaiting trainer action.
 *                 Grants NO per-student data access.
 *  - 'active'   = the APPROVED state (intentionally reused so existing
 *                 ownership/count/list queries that key on 'active' keep working
 *                 unchanged). This is the only status that grants data access.
 *  - 'rejected' = the trainer declined the request.
 *  - 'inactive' = a previously-active link that was deactivated.
 */
exports.TRAINER_LINK_STATUSES = ['pending', 'active', 'rejected', 'inactive'];
//# sourceMappingURL=domain.js.map