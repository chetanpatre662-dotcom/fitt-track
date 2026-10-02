import { aiConversationRepository } from '../repositories/aiConversationRepository.js';
import { logger } from '../utils/logger.js';

export const AI_CHAT_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount: number;
}

export interface ConversationMessage {
  role: string;
  text: string;
  createdAt: string | null;
}

/**
 * AI chat history + 30-day retention.
 *
 * Reuses the EXISTING persistence (users/{uid}/aiConversations/{id} with its
 * messages subcollection). No second chat-storage system is introduced.
 */
export class AiConversationService {
  /** Lists the signed-in user's conversations, newest-updated first. */
  async listConversations(uid: string): Promise<ConversationSummary[]> {
    return aiConversationRepository.listConversations(uid);
  }

  /** Returns one conversation's messages (oldest-first) for the owner. */
  async getMessages(uid: string, conversationId: string): Promise<ConversationMessage[]> {
    return aiConversationRepository.getMessages(uid, conversationId);
  }

  /**
   * Pure retention predicate — true when a record last updated at [updatedAt]
   * is strictly older than [retentionDays] relative to [now]. A record with no
   * timestamp is treated as NOT expired (we never delete data we can't age).
   * Exposed for unit testing the retention boundary without Firestore.
   */
  isExpired(updatedAt: Date | null | undefined, now: Date, retentionDays = AI_CHAT_RETENTION_DAYS): boolean {
    if (!updatedAt) return false;
    const ageMs = now.getTime() - updatedAt.getTime();
    return ageMs > retentionDays * MS_PER_DAY;
  }

  /** Computes the cutoff Date: records with updatedAt < cutoff are expired. */
  cutoffFor(now: Date, retentionDays = AI_CHAT_RETENTION_DAYS): Date {
    return new Date(now.getTime() - retentionDays * MS_PER_DAY);
  }

  /**
   * Deletes AI conversations older than [retentionDays] across all users.
   * Scoped exclusively to aiConversations data. Returns the total number of
   * conversations deleted. Best-effort per user: an error for one user is
   * logged and does not abort the sweep.
   */
  async cleanupOlderThan(retentionDays = AI_CHAT_RETENTION_DAYS, now: Date = new Date()): Promise<number> {
    const cutoff = this.cutoffFor(now, retentionDays);
    let total = 0;
    await aiConversationRepository.forEachUserWithConversations(async (uid) => {
      try {
        total += await aiConversationRepository.deleteConversationsOlderThan(uid, cutoff);
      } catch (err) {
        logger.warn({ err, uid }, 'AI chat cleanup failed for user');
      }
    });
    return total;
  }
}

export const aiConversationService = new AiConversationService();
