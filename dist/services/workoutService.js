"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workoutService = exports.WorkoutService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const workoutRepository_js_1 = require("../repositories/workoutRepository.js");
const errors_js_1 = require("../utils/errors.js");
const workoutCalc_js_1 = require("../utils/workoutCalc.js");
const exerciseService_js_1 = require("./exerciseService.js");
const personalRecordService_js_1 = require("./personalRecordService.js");
/**
 * Workout business logic: create/update templates & sessions, enforce status
 * transitions, compute derived stats (volume, sets, reps, muscle groups), and
 * duplicate workouts. Exercise `primaryMuscle` is resolved from the validated
 * exercise library so muscle-group tagging is trustworthy (and invalid
 * exerciseIds are rejected).
 */
class WorkoutService {
    /** Validates exerciseIds against the library and attaches primaryMuscle. */
    async hydrateExercises(input) {
        const result = [];
        for (const ex of input.exercises) {
            // Throws NotFoundError if the exercise id is invalid.
            const libEx = await exerciseService_js_1.exerciseService.getById(ex.exerciseId);
            result.push({
                exerciseId: ex.exerciseId,
                order: ex.order,
                notes: ex.notes ?? null,
                primaryMuscle: libEx.primaryMuscle,
                sets: ex.sets.map((s) => ({
                    setNumber: s.setNumber,
                    weightKg: s.weightKg ?? null,
                    reps: s.reps ?? null,
                    distanceM: s.distanceM ?? null,
                    durationSeconds: s.durationSeconds ?? null,
                    calories: s.calories ?? null,
                    completed: s.completed,
                })),
            });
        }
        // Normalize ordering.
        result.sort((a, b) => a.order - b.order);
        return result;
    }
    async create(uid, input) {
        const exercises = await this.hydrateExercises(input);
        const stats = (0, workoutCalc_js_1.computeWorkoutStats)(exercises);
        const id = workoutRepository_js_1.workoutRepository.newId(uid);
        const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
        const data = {
            name: input.name,
            type: input.type,
            isTemplate: input.isTemplate,
            status: input.isTemplate ? 'planned' : 'planned',
            notes: input.notes ?? null,
            exercises,
            muscleGroups: stats.muscleGroups,
            totalVolume: stats.totalVolume,
            totalSets: stats.totalSets,
            completedSets: stats.completedSets,
            totalReps: stats.totalReps,
            startedAt: null,
            endedAt: null,
            durationSeconds: 0,
            createdAt: now,
        };
        return workoutRepository_js_1.workoutRepository.set(uid, id, data);
    }
    async get(uid, id) {
        const w = await workoutRepository_js_1.workoutRepository.get(uid, id);
        if (!w)
            throw new errors_js_1.NotFoundError('Workout not found');
        return w;
    }
    async list(uid, opts) {
        return workoutRepository_js_1.workoutRepository.list(uid, opts);
    }
    async update(uid, id, input) {
        const existing = await workoutRepository_js_1.workoutRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Workout not found');
        if (existing.status === 'completed') {
            // Completed workouts are immutable records (matches AI-safety requirement).
            throw new errors_js_1.BadRequestError('Completed workouts cannot be edited.');
        }
        const exercises = await this.hydrateExercises(input);
        const stats = (0, workoutCalc_js_1.computeWorkoutStats)(exercises);
        return workoutRepository_js_1.workoutRepository.set(uid, id, {
            name: input.name,
            type: input.type,
            isTemplate: input.isTemplate,
            notes: input.notes ?? null,
            exercises,
            muscleGroups: stats.muscleGroups,
            totalVolume: stats.totalVolume,
            totalSets: stats.totalSets,
            completedSets: stats.completedSets,
            totalReps: stats.totalReps,
        });
    }
    /** Applies a status transition, stamping timestamps/duration as appropriate. */
    async transition(uid, id, to) {
        const existing = await workoutRepository_js_1.workoutRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Workout not found');
        const from = existing.status ?? 'planned';
        if (from === to)
            return existing;
        if (!(0, workoutCalc_js_1.canTransition)(from, to)) {
            throw new errors_js_1.BadRequestError(`Cannot change workout status from ${from} to ${to}.`);
        }
        const patch = { status: to };
        const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
        if (to === 'in_progress' && !existing.startedAt) {
            patch.startedAt = now;
        }
        if (to === 'completed' || to === 'cancelled') {
            patch.endedAt = now;
            // Recompute duration from startedAt if present.
            const started = existing.startedAt;
            if (started && typeof started.toDate === 'function') {
                patch.durationSeconds = Math.max(0, Math.round((Date.now() - started.toDate().getTime()) / 1000));
            }
        }
        const saved = await workoutRepository_js_1.workoutRepository.set(uid, id, patch);
        // On completion, detect personal records (best-effort, never blocks).
        if (to === 'completed') {
            const exercises = (existing.exercises ?? []);
            const newPrs = await personalRecordService_js_1.personalRecordService.detectAndRecord(uid, id, exercises);
            if (newPrs.length > 0) {
                saved.newPersonalRecords = newPrs;
            }
        }
        return saved;
    }
    async delete(uid, id) {
        const existing = await workoutRepository_js_1.workoutRepository.get(uid, id);
        if (!existing)
            throw new errors_js_1.NotFoundError('Workout not found');
        await workoutRepository_js_1.workoutRepository.delete(uid, id);
    }
    /**
     * Duplicates a workout/template into a fresh planned workout. Sets are copied
     * but marked not-completed so the user starts clean; timings reset.
     */
    async duplicate(uid, id, asTemplate) {
        const src = await workoutRepository_js_1.workoutRepository.get(uid, id);
        if (!src)
            throw new errors_js_1.NotFoundError('Workout not found');
        const exercises = (src.exercises ?? []).map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) => ({ ...s, completed: false })),
        }));
        const stats = (0, workoutCalc_js_1.computeWorkoutStats)(exercises);
        const newId = workoutRepository_js_1.workoutRepository.newId(uid);
        const now = firebase_js_1.admin.firestore.FieldValue.serverTimestamp();
        return workoutRepository_js_1.workoutRepository.set(uid, newId, {
            name: `${src.name ?? 'Workout'} (copy)`,
            type: src.type ?? 'strength',
            isTemplate: asTemplate ?? Boolean(src.isTemplate),
            status: 'planned',
            notes: src.notes ?? null,
            exercises,
            muscleGroups: stats.muscleGroups,
            totalVolume: stats.totalVolume,
            totalSets: stats.totalSets,
            completedSets: stats.completedSets,
            totalReps: stats.totalReps,
            startedAt: null,
            endedAt: null,
            durationSeconds: 0,
            createdAt: now,
        });
    }
}
exports.WorkoutService = WorkoutService;
exports.workoutService = new WorkoutService();
//# sourceMappingURL=workoutService.js.map