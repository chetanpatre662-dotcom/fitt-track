"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressService = exports.ProgressService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const prCalc_js_1 = require("../utils/prCalc.js");
function rangeStart(range) {
    const now = Date.now();
    const day = 86_400_000;
    switch (range) {
        case '7d':
            return new Date(now - 7 * day);
        case '30d':
            return new Date(now - 30 * day);
        case '90d':
            return new Date(now - 90 * day);
        case '1y':
            return new Date(now - 365 * day);
        case 'all':
            return null;
    }
}
/**
 * Aggregates completed-workout data for history & progression views.
 * Reads completed workouts once and computes summaries in-memory (workout
 * counts are modest per user, so this avoids many composite-index queries).
 */
class ProgressService {
    async loadCompleted(uid, start) {
        const col = (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('workouts');
        const q = col.where('status', '==', 'completed');
        const snap = await q.get();
        const out = [];
        for (const d of snap.docs) {
            const data = d.data();
            const started = data.startedAt;
            const startedAt = started && typeof started.toDate === 'function' ? started.toDate() : null;
            if (start && startedAt && startedAt < start)
                continue;
            if (start && !startedAt)
                continue;
            out.push({
                id: d.id,
                name: data.name ?? 'Workout',
                startedAt,
                durationSeconds: data.durationSeconds ?? 0,
                totalVolume: data.totalVolume ?? 0,
                completedSets: data.completedSets ?? 0,
                totalReps: data.totalReps ?? 0,
                muscleGroups: data.muscleGroups ?? [],
                exercises: data.exercises ?? [],
            });
        }
        // Sort by date ascending for series.
        out.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
        return out;
    }
    /** Overall workout summary + per-day series for the range. */
    async workoutSummary(uid, range) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        const totalWorkouts = workouts.length;
        const totalVolume = workouts.reduce((s, w) => s + w.totalVolume, 0);
        const totalSets = workouts.reduce((s, w) => s + w.completedSets, 0);
        const totalDuration = workouts.reduce((s, w) => s + w.durationSeconds, 0);
        // Muscle-group frequency.
        const muscleFrequency = {};
        for (const w of workouts) {
            for (const m of w.muscleGroups) {
                muscleFrequency[m] = (muscleFrequency[m] ?? 0) + 1;
            }
        }
        // Per-day volume & count series (yyyy-MM-dd local).
        const byDay = {};
        for (const w of workouts) {
            if (!w.startedAt)
                continue;
            const key = dateKey(w.startedAt);
            byDay[key] ??= { volume: 0, count: 0, durationSeconds: 0 };
            byDay[key].volume += w.totalVolume;
            byDay[key].count += 1;
            byDay[key].durationSeconds += w.durationSeconds;
        }
        const series = Object.entries(byDay)
            .map(([date, v]) => ({ date, ...v }))
            .sort((a, b) => a.date.localeCompare(b.date));
        return {
            range,
            totalWorkouts,
            totalVolume,
            totalSets,
            totalDurationSeconds: totalDuration,
            averageDurationSeconds: totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0,
            muscleFrequency,
            series,
        };
    }
    /** Progression for a single exercise: per-workout best set over time. */
    async exerciseProgression(uid, exerciseId, range) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        const points = [];
        for (const w of workouts) {
            const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
            if (!ex || !w.startedAt)
                continue;
            const best = (0, prCalc_js_1.bestSetForWorkout)(ex.sets);
            if (!best)
                continue;
            // `maxReps` now means the reps performed on the max-weight set (NOT the
            // max reps of any set); the wire key is kept for backward compatibility.
            points.push({
                date: dateKey(w.startedAt),
                maxWeightKg: best.weightKg,
                maxReps: best.reps,
                totalVolume: best.volume,
                estimated1RmKg: best.estimated1Rm,
            });
        }
        return { exerciseId, range, points };
    }
    /** Recent completed workouts (history list). */
    async history(uid, range, limit = 100) {
        const workouts = await this.loadCompleted(uid, rangeStart(range));
        return workouts
            .slice()
            .reverse()
            .slice(0, limit)
            .map((w) => toHistoryItem(w));
    }
    /**
     * A single newest-first page of completed-workout history, served by a real
     * cursor query:
     *   where('status','==','completed').orderBy('startedAt','desc')
     *     .startAfter(cursorStartedAt).limit(pageSize+1)
     * which is exactly covered by the EXISTING workouts (status ASC, startedAt
     * DESC) composite index — NO index change is required.
     *
     * We fetch `pageSize + 1` docs so the presence of an extra row tells us a
     * next page exists without a second round-trip; `nextCursor` is the ISO
     * `startedAt` of the last returned item (null when the page is the last one).
     *
     * The results are also sorted/sliced in memory as a defensive fallback so
     * correctness holds under test doubles whose orderBy/limit/startAfter are
     * no-op passthroughs; against real Firestore the query already returns the
     * ordered page and the in-memory step is a no-op.
     */
    async historyPage(uid, opts = {}) {
        const pageSize = clampPageSize(opts.limit);
        const cursorMs = parseCursor(opts.cursorStartedAt);
        const col = (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('workouts');
        let q = col
            .where('status', '==', 'completed')
            .orderBy('startedAt', 'desc');
        if (cursorMs !== null) {
            q = q.startAfter(new Date(cursorMs));
        }
        q = q.limit(pageSize + 1);
        const snap = await q.get();
        // Normalize + defensive in-memory ordering/paging (see method doc).
        const rows = snap.docs
            .map((d) => normalizeCompleted(d.id, d.data()))
            .filter((w) => w.startedAt !== null)
            .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
        const afterCursor = cursorMs === null ? rows : rows.filter((w) => (w.startedAt?.getTime() ?? 0) < cursorMs);
        const hasMore = afterCursor.length > pageSize;
        const page = afterCursor.slice(0, pageSize);
        const last = page[page.length - 1];
        const nextCursor = hasMore && last?.startedAt ? last.startedAt.toISOString() : null;
        return { items: page.map((w) => toHistoryItem(w)), nextCursor };
    }
}
exports.ProgressService = ProgressService;
/** Default/max history page sizes (design §7: page size 20-30). */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
function clampPageSize(limit) {
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0)
        return DEFAULT_PAGE_SIZE;
    return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}
/** Parses an ISO cursor to epoch ms, or null when absent/unparseable. */
function parseCursor(cursor) {
    if (!cursor)
        return null;
    const ms = Date.parse(cursor);
    return Number.isNaN(ms) ? null : ms;
}
/** Reads a stored startedAt Timestamp (or null) off a raw workout doc. */
function startedAtOf(data) {
    const started = data.startedAt;
    return started && typeof started.toDate === 'function' ? started.toDate() : null;
}
/** Projects a raw workout doc into the in-memory CompletedWorkout shape. */
function normalizeCompleted(id, data) {
    return {
        id,
        name: data.name ?? 'Workout',
        startedAt: startedAtOf(data),
        durationSeconds: data.durationSeconds ?? 0,
        totalVolume: data.totalVolume ?? 0,
        completedSets: data.completedSets ?? 0,
        totalReps: data.totalReps ?? 0,
        muscleGroups: data.muscleGroups ?? [],
        exercises: data.exercises ?? [],
    };
}
/** Projects a CompletedWorkout into the history list item contract. */
function toHistoryItem(w) {
    return {
        id: w.id,
        name: w.name,
        date: w.startedAt ? w.startedAt.toISOString() : null,
        durationSeconds: w.durationSeconds,
        totalVolume: w.totalVolume,
        completedSets: w.completedSets,
        totalReps: w.totalReps,
        muscleGroups: w.muscleGroups,
    };
}
function dateKey(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}
exports.progressService = new ProgressService();
//# sourceMappingURL=progressService.js.map