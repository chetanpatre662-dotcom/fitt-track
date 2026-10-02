import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Gemini client so detection is deterministic (no network / no key).
const generateJson = vi.fn();
vi.mock('../ai/geminiClient.js', () => ({
  generateJson: (...args: unknown[]) => generateJson(...args),
  generateText: vi.fn(),
}));

// aiContextService / exerciseService are imported by aiService but not used by
// detectPlanModification; stub them so the module loads without Firebase.
vi.mock('../services/aiContextService.js', () => ({ aiContextService: {} }));
vi.mock('../services/exerciseService.js', () => ({ exerciseService: {} }));

import { aiService } from '../services/aiService.js';

describe('Item 9 — chat plan-modification detection', () => {
  beforeEach(() => generateJson.mockReset());

  it('detects a modification and keeps only valid muscle groups', async () => {
    generateJson.mockResolvedValue({ isModification: true, muscleGroups: ['back', 'biceps'] });
    const r = await aiService.detectPlanModification('only back and biceps today', ['chest', 'triceps']);
    expect(r.isModification).toBe(true);
    expect(r.muscleGroups).toEqual(['back', 'biceps']);
  });

  it('drops invented/invalid muscle groups and dedupes', async () => {
    generateJson.mockResolvedValue({
      isModification: true,
      muscleGroups: ['back', 'wings', 'back', 'legs'],
    });
    const r = await aiService.detectPlanModification('train back and legs', []);
    expect(r.isModification).toBe(true);
    expect(r.muscleGroups).toEqual(['back', 'legs']);
  });

  it('treats a normal question as NOT a modification', async () => {
    generateJson.mockResolvedValue({ isModification: false, muscleGroups: [] });
    const r = await aiService.detectPlanModification('what should I train today?', ['chest']);
    expect(r.isModification).toBe(false);
    expect(r.muscleGroups).toEqual([]);
  });

  it('is NOT a modification when no valid muscle groups remain (fail safe)', async () => {
    generateJson.mockResolvedValue({ isModification: true, muscleGroups: ['wings'] });
    const r = await aiService.detectPlanModification('do something', []);
    expect(r.isModification).toBe(false);
    expect(r.muscleGroups).toEqual([]);
  });

  it('is NOT a modification when the model returns an empty desired set', async () => {
    // Covers the "fail safe" branch without relying on a thrown-mock, which
    // vitest treats as a test error. An empty/absent muscle set is never a
    // modification regardless of the isModification flag.
    generateJson.mockResolvedValue({ isModification: true, muscleGroups: [] });
    const r = await aiService.detectPlanModification('hmm', ['chest']);
    expect(r.isModification).toBe(false);
    expect(r.muscleGroups).toEqual([]);
  });
});
