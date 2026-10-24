import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * aiService resilience (FEAT-001 Part 4): the service threads an optional
 * AbortSignal into generateText/generateJson and keeps each guarded method's
 * safe fallback (retry lives only in geminiClient). We mock the geminiClient so
 * the service behavior is isolated from the SDK.
 *
 * NOTE: mocked green != live Gemini fixed (see geminiClient.retry.test.ts).
 */

const generateJson = vi.fn();
const generateText = vi.fn();

vi.mock('../ai/geminiClient.js', () => ({
  generateJson: (...args: unknown[]) => generateJson(...args),
  generateText: (...args: unknown[]) => generateText(...args),
}));

// aiService pulls in these services at module load but they are unused by the
// methods under test; stub them so the module loads without Firebase.
vi.mock('../services/aiContextService.js', () => ({
  aiContextService: {
    userContext: async () => ({}),
    recentWorkouts: async () => [],
    todayNutrition: async () => ({}),
  },
}));
vi.mock('../services/exerciseService.js', () => ({ exerciseService: {} }));

import { aiService } from '../services/aiService.js';

beforeEach(() => {
  generateJson.mockReset();
  generateText.mockReset();
});

describe('aiService.chat', () => {
  it('passes the caller AbortSignal through to generateText', async () => {
    generateText.mockResolvedValue('coach reply');
    const controller = new AbortController();
    const reply = await aiService.chat('uid', 'hi', [], null, controller.signal);
    expect(reply).toBe('coach reply');
    const opts = generateText.mock.calls[0][0] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });
});

describe('aiService.detectPlanModification', () => {
  it('passes the AbortSignal into generateJson and returns a parsed modification', async () => {
    generateJson.mockResolvedValue({ isModification: true, muscleGroups: ['back', 'biceps'] });
    const controller = new AbortController();
    const r = await aiService.detectPlanModification('only back and biceps', ['chest'], controller.signal);
    expect(r).toEqual({ isModification: true, muscleGroups: ['back', 'biceps'] });
    const opts = generateJson.mock.calls[0][0] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });

  it('degrades to a safe non-modification when generateJson throws (e.g. a 503 after retries)', async () => {
    generateJson.mockRejectedValue(new Error('AI service is temporarily unavailable.'));
    const r = await aiService.detectPlanModification('only back', []);
    expect(r).toEqual({ isModification: false, muscleGroups: [] });
  });

  it('drops invented muscle groups (strict re-validation)', async () => {
    generateJson.mockResolvedValue({ isModification: true, muscleGroups: ['back', 'wings'] });
    const r = await aiService.detectPlanModification('train back', []);
    expect(r).toEqual({ isModification: true, muscleGroups: ['back'] });
  });
});

describe('aiService.dailyInsight safe fallback', () => {
  it('returns a canned insight when generateJson throws', async () => {
    generateJson.mockRejectedValue(new Error('503'));
    const r = await aiService.dailyInsight('uid');
    expect(typeof r.insight).toBe('string');
    expect(r.insight.length).toBeGreaterThan(0);
  });
});
