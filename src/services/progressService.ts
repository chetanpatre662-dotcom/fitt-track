import { getFirestore } from '../config/firebase.js';
import type { WorkoutExerciseData } from '../utils/workoutCalc.js';
import { bestSetForWorkout } from '../utils/prCalc.js';

export type RangeKey = '7d' | '30d' | '90d' | '1y' | 'all';

function rangeStart(range: RangeKey): Date | null {
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

interface CompletedWorkout {
  id: string;
  name: string;
  startedAt: Date | null;
  durationSeconds: number;
  totalVolume: number;
  completedSets: number;
  totalReps: number;
  muscleGroups: string[];
  exercises: WorkoutExerciseData[];
}

/**
 * Aggregates completed-workout data for history & progression views.
 * Reads completed workouts once and computes summaries in-memory (workout
 * counts are modest per user, so this avoids many composite-index queries).
 */
export class ProgressService {
  private async loadCompleted(uid: string, start: Date | null): Promise<CompletedWorkout[]> {
    const col = getFirestore().collection('users').doc(uid).collection('workouts');
    const q: FirebaseFirestore.Query = col.where('status', '==', 'completed');
    const snap = await q.get();

    const out: CompletedWorkout[] = [];
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const started = data.startedAt as FirebaseFirestore.Timestamp | null | undefined;
      const startedAt = started && typeof started.toDate === 'function' ? started.toDate() : null;
      if (start && startedAt && startedAt < start) continue;
      if (start && !startedAt) continue;
      out.push({
        id: d.id,
        name: (data.name as string) ?? 'Workout',
        startedAt,
        durationSeconds: (data.durationSeconds as number) ?? 0,
        totalVolume: (data.totalVolume as number) ?? 0,
        completedSets: (data.completedSets as number) ?? 0,
        totalReps: (data.totalReps as number) ?? 0,
        muscleGroups: (data.muscleGroups as string[]) ?? [],
        exercises: (data.exercises as WorkoutExerciseData[]) ?? [],
      });
    }
    // Sort by date ascending for series.
    out.sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0));
    return out;
  }

  /** Overall workout summary + per-day series for the range. */
  async workoutSummary(uid: string, range: RangeKey) {
    const workouts = await this.loadCompleted(uid, rangeStart(range));

    const totalWorkouts = workouts.length;
    const totalVolume = workouts.reduce((s, w) => s + w.totalVolume, 0);
    const totalSets = workouts.reduce((s, w) => s + w.completedSets, 0);
    const totalDuration = workouts.reduce((s, w) => s + w.durationSeconds, 0);

    // Muscle-group frequency.
    const muscleFrequency: Record<string, number> = {};
    for (const w of workouts) {
      for (const m of w.muscleGroups) {
        muscleFrequency[m] = (muscleFrequency[m] ?? 0) + 1;
      }
    }

    // Per-day volume & count series (yyyy-MM-dd local).
    const byDay: Record<string, { volume: number; count: number; durationSeconds: number }> = {};
    for (const w of workouts) {
      if (!w.startedAt) continue;
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
  async exerciseProgression(uid: string, exerciseId: string, range: RangeKey) {
    const workouts = await this.loadCompleted(uid, rangeStart(range));
    const points: {
      date: string;
      maxWeightKg: number;
      maxReps: number;
      totalVolume: number;
      estimated1RmKg: number | null;
    }[] = [];

    for (const w of workouts) {
      const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!ex || !w.startedAt) continue;
      const best = bestSetForWorkout(ex.sets);
      if (!best) continue;
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
  async history(uid: string, range: RangeKey, limit = 100) {
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
  async historyPage(
    uid: string,
    opts: { limit?: number; cursorStartedAt?: string | null } = {},
  ): Promise<{ items: ReturnType<typeof toHistoryItem>[]; nextCursor: string | null }> {
    const pageSize = clampPageSize(opts.limit);
    const cursorMs = parseCursor(opts.cursorStartedAt);

    const col = getFirestore().collection('users').doc(uid).collection('workouts');
    let q: FirebaseFirestore.Query = col
      .where('status', '==', 'completed')
      .orderBy('startedAt', 'desc');
    if (cursorMs !== null) {
      q = q.startAfter(new Date(cursorMs));
    }
    q = q.limit(pageSize + 1);
    const snap = await q.get();

    // Normalize + defensive in-memory ordering/paging (see method doc).
    const rows = snap.docs
      .map((d) => normalizeCompleted(d.id, d.data() as Record<string, unknown>))
      .filter((w) => w.startedAt !== null)
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));

    const afterCursor =
      cursorMs === null ? rows : rows.filter((w) => (w.startedAt?.getTime() ?? 0) < cursorMs);

    const hasMore = afterCursor.length > pageSize;
    const page = afterCursor.slice(0, pageSize);
    const last = page[page.length - 1];
    const nextCursor = hasMore && last?.startedAt ? last.startedAt.toISOString() : null;

    return { items: page.map((w) => toHistoryItem(w)), nextCursor };
  }
}

/** Default/max history page sizes (design §7: page size 20-30). */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function clampPageSize(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
}

/** Parses an ISO cursor to epoch ms, or null when absent/unparseable. */
function parseCursor(cursor?: string | null): number | null {
  if (!cursor) return null;
  const ms = Date.parse(cursor);
  return Number.isNaN(ms) ? null : ms;
}

/** Reads a stored startedAt Timestamp (or null) off a raw workout doc. */
function startedAtOf(data: Record<string, unknown>): Date | null {
  const started = data.startedAt as FirebaseFirestore.Timestamp | null | undefined;
  return started && typeof started.toDate === 'function' ? started.toDate() : null;
}

/** Projects a raw workout doc into the in-memory CompletedWorkout shape. */
function normalizeCompleted(id: string, data: Record<string, unknown>): CompletedWorkout {
  return {
    id,
    name: (data.name as string) ?? 'Workout',
    startedAt: startedAtOf(data),
    durationSeconds: (data.durationSeconds as number) ?? 0,
    totalVolume: (data.totalVolume as number) ?? 0,
    completedSets: (data.completedSets as number) ?? 0,
    totalReps: (data.totalReps as number) ?? 0,
    muscleGroups: (data.muscleGroups as string[]) ?? [],
    exercises: (data.exercises as WorkoutExerciseData[]) ?? [],
  };
}

/** Projects a CompletedWorkout into the history list item contract. */
function toHistoryItem(w: CompletedWorkout) {
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

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const progressService = new ProgressService();
