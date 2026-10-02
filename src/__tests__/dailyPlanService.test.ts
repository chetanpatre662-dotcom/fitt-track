import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Firebase-dependent repository with an in-memory store.
const store = new Map<string, Record<string, unknown>>();
vi.mock('../repositories/dailyPlanRepository.js', () => ({
  dailyPlanRepository: {
    get: vi.fn(async (uid: string, dateKey: string) => store.get(`${uid}/${dateKey}`) ?? null),
    set: vi.fn(async (uid: string, dateKey: string, data: Record<string, unknown>) => {
      const key = `${uid}/${dateKey}`;
      const existing = store.get(key);
      const saved = { id: dateKey, ...existing, ...data, dateKey };
      store.set(key, saved);
      return saved;
    }),
  },
}));

// Mock the AI engine so no Gemini/Firebase is needed.
const workoutReco = vi.fn();
vi.mock('../services/aiService.js', () => ({
  aiService: { workoutRecommendation: (...args: unknown[]) => workoutReco(...args) },
}));

// Mock the exercise library lookup used to derive muscle groups + names.
vi.mock('../services/exerciseService.js', () => ({
  exerciseService: {
    getById: vi.fn(async (id: string) => ({
      id,
      name: `Exercise ${id}`,
      primaryMuscle: id.startsWith('back') ? 'back' : id.startsWith('bi') ? 'biceps' : 'chest',
    })),
  },
}));

import { dailyPlanService } from '../services/dailyPlanService.js';
import { dailyPlanRepository } from '../repositories/dailyPlanRepository.js';

const UID = 'u1';
const DATE = '2026-10-02';

function reco(exerciseIds: string[]) {
  return {
    title: 'AI workout',
    goal: 'strength',
    durationMinutes: 45,
    exercises: exerciseIds.map((exerciseId) => ({
      exerciseId,
      sets: 3,
      repMin: 8,
      repMax: 12,
      restSeconds: 90,
      reason: '',
    })),
    notes: '',
  };
}

describe('Item 9 — dailyPlanService single source of truth', () => {
  beforeEach(() => {
    store.clear();
    workoutReco.mockReset();
    vi.mocked(dailyPlanRepository.set).mockClear();
  });

  it('getOrCreate generates + persists once, then returns the SAME plan (no duplicate)', async () => {
    workoutReco.mockResolvedValue(reco(['chest1', 'chest2']));

    const first = await dailyPlanService.getOrCreate(UID, DATE);
    expect(first.source).toBe('ai');
    expect(first.dateKey).toBe(DATE);
    expect(workoutReco).toHaveBeenCalledTimes(1);

    const second = await dailyPlanService.getOrCreate(UID, DATE);
    // No second generation; same stored plan returned.
    expect(workoutReco).toHaveBeenCalledTimes(1);
    expect(second.id).toBe(first.id);
    // Only one document for the date.
    expect([...store.keys()]).toEqual([`${UID}/${DATE}`]);
  });

  it('generate without force returns the existing plan (idempotent per date)', async () => {
    workoutReco.mockResolvedValue(reco(['chest1']));
    await dailyPlanService.getOrCreate(UID, DATE);
    workoutReco.mockClear();

    const again = await dailyPlanService.generate(UID, { date: DATE });
    expect(workoutReco).not.toHaveBeenCalled();
    expect(again.dateKey).toBe(DATE);
  });

  it('generate with force regenerates and overwrites the same date doc', async () => {
    workoutReco.mockResolvedValue(reco(['chest1']));
    await dailyPlanService.getOrCreate(UID, DATE);

    workoutReco.mockResolvedValue(reco(['back1']));
    const forced = await dailyPlanService.generate(UID, { date: DATE, force: true });
    expect(forced.source).toBe('ai');
    expect((forced.muscleGroups as string[])).toContain('back');
    expect([...store.keys()]).toEqual([`${UID}/${DATE}`]); // still one doc
  });

  it('update with muscleGroups regenerates, marks user_modified, and keeps the declared target', async () => {
    workoutReco.mockResolvedValue(reco(['chest1']));
    await dailyPlanService.getOrCreate(UID, DATE);

    // "I only want back and biceps today."
    workoutReco.mockResolvedValue(reco(['back1', 'bi1']));
    const updated = await dailyPlanService.update(UID, { date: DATE, muscleGroups: ['back', 'biceps'] });
    expect(updated.source).toBe('user_modified');
    expect(updated.muscleGroups).toEqual(['back', 'biceps']);
    expect([...store.keys()]).toEqual([`${UID}/${DATE}`]); // same single doc
  });

  it('update with explicit exercises saves a user-modified structured plan', async () => {
    workoutReco.mockResolvedValue(reco(['chest1']));
    await dailyPlanService.getOrCreate(UID, DATE);

    const updated = await dailyPlanService.update(UID, {
      date: DATE,
      exercises: [{ exerciseId: 'back1', sets: 4, repMin: 6, repMax: 10, restSeconds: 120, reason: '' }],
    });
    expect(updated.source).toBe('user_modified');
    expect((updated.exercises as unknown[]).length).toBe(1);
    // Muscle groups derived from the explicit exercises.
    expect(updated.muscleGroups).toEqual(['back']);
  });

  it('summarizeForChat reflects the SAME persisted plan Chat and Plans share', async () => {
    workoutReco.mockResolvedValue(reco(['back1', 'bi1']));
    await dailyPlanService.getOrCreate(UID, DATE);

    const summary = await dailyPlanService.summarizeForChat(UID, DATE);
    expect(summary).toContain('muscleGroups: back, biceps');
    expect(summary).toContain('Exercise back1');
  });

  it('summarizeForChat returns null when no plan exists', async () => {
    const summary = await dailyPlanService.summarizeForChat(UID, DATE);
    expect(summary).toBeNull();
  });
});
