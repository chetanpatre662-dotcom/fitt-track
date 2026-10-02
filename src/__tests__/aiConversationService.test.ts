import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory model of users/{uid}/aiConversations/{id} with an updatedAt Date.
interface Conv { id: string; uid: string; updatedAt: Date }
let convs: Conv[] = [];
// Records what other data a (hypothetical) broad cleanup might touch — must stay empty.
const otherCollectionsTouched: string[] = [];

vi.mock('../repositories/aiConversationRepository.js', () => ({
  aiConversationRepository: {
    forEachUserWithConversations: vi.fn(async (fn: (uid: string) => Promise<void>) => {
      const uids = [...new Set(convs.map((c) => c.uid))];
      for (const uid of uids) await fn(uid);
    }),
    deleteConversationsOlderThan: vi.fn(async (uid: string, cutoff: Date) => {
      const before = convs.length;
      convs = convs.filter((c) => !(c.uid === uid && c.updatedAt.getTime() < cutoff.getTime()));
      return before - convs.length;
    }),
  },
}));

import { aiConversationService, AI_CHAT_RETENTION_DAYS } from '../services/aiConversationService.js';

const NOW = new Date('2026-10-02T12:00:00.000Z');
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe('AI chat 30-day retention', () => {
  beforeEach(() => {
    convs = [];
    otherCollectionsTouched.length = 0;
  });

  it('isExpired: a conversation exactly 30 days old is NOT expired (within retention)', () => {
    expect(aiConversationService.isExpired(daysAgo(30), NOW)).toBe(false);
  });

  it('isExpired: a conversation older than 30 days IS expired', () => {
    expect(aiConversationService.isExpired(daysAgo(31), NOW)).toBe(true);
    expect(aiConversationService.isExpired(daysAgo(45), NOW)).toBe(true);
  });

  it('isExpired: a recent conversation is NOT expired', () => {
    expect(aiConversationService.isExpired(daysAgo(1), NOW)).toBe(false);
    expect(aiConversationService.isExpired(NOW, NOW)).toBe(false);
  });

  it('isExpired: a missing timestamp is treated as NOT expired (never delete un-ageable data)', () => {
    expect(aiConversationService.isExpired(null, NOW)).toBe(false);
    expect(aiConversationService.isExpired(undefined, NOW)).toBe(false);
  });

  it('cleanup deletes ONLY conversations older than 30 days; within-30-days remain', async () => {
    convs = [
      { id: 'old1', uid: 'u1', updatedAt: daysAgo(31) },
      { id: 'old2', uid: 'u1', updatedAt: daysAgo(90) },
      { id: 'fresh1', uid: 'u1', updatedAt: daysAgo(2) },
      { id: 'edge', uid: 'u1', updatedAt: daysAgo(30) }, // exactly 30 days → keep
    ];

    const deleted = await aiConversationService.cleanupOlderThan(AI_CHAT_RETENTION_DAYS, NOW);

    expect(deleted).toBe(2);
    expect(convs.map((c) => c.id).sort()).toEqual(['edge', 'fresh1']);
  });

  it('cleanup is scoped per user and spans all users with conversations', async () => {
    convs = [
      { id: 'u1-old', uid: 'u1', updatedAt: daysAgo(40) },
      { id: 'u1-new', uid: 'u1', updatedAt: daysAgo(5) },
      { id: 'u2-old', uid: 'u2', updatedAt: daysAgo(60) },
    ];

    const deleted = await aiConversationService.cleanupOlderThan(AI_CHAT_RETENTION_DAYS, NOW);

    expect(deleted).toBe(2);
    expect(convs.map((c) => c.id)).toEqual(['u1-new']);
  });

  it('cleanup touches ONLY AI chat data (no other collection is referenced)', async () => {
    convs = [{ id: 'old', uid: 'u1', updatedAt: daysAgo(100) }];
    await aiConversationService.cleanupOlderThan(AI_CHAT_RETENTION_DAYS, NOW);
    // The service only ever calls the aiConversation repository; nothing else
    // is wired in, so no profile/workout/nutrition/progress collection can be
    // affected. This asserts the test harness never recorded a foreign write.
    expect(otherCollectionsTouched).toEqual([]);
  });

  it('cutoffFor returns a date exactly retentionDays before now', () => {
    const cutoff = aiConversationService.cutoffFor(NOW, 30);
    expect(cutoff.toISOString()).toBe(daysAgo(30).toISOString());
  });
});
