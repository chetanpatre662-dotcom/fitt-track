"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConversationService = exports.AiConversationService = exports.AI_CHAT_RETENTION_DAYS = void 0;
const aiConversationRepository_js_1 = require("../repositories/aiConversationRepository.js");
const logger_js_1 = require("../utils/logger.js");
exports.AI_CHAT_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/**
 * AI chat history + 30-day retention.
 *
 * Reuses the EXISTING persistence (users/{uid}/aiConversations/{id} with its
 * messages subcollection). No second chat-storage system is introduced.
 */
class AiConversationService {
    /** Lists the signed-in user's conversations, newest-updated first. */
    async listConversations(uid) {
        return aiConversationRepository_js_1.aiConversationRepository.listConversations(uid);
    }
    /** Returns one conversation's messages (oldest-first) for the owner. */
    async getMessages(uid, conversationId) {
        return aiConversationRepository_js_1.aiConversationRepository.getMessages(uid, conversationId);
    }
    /**
     * Pure retention predicate — true when a record last updated at [updatedAt]
     * is strictly older than [retentionDays] relative to [now]. A record with no
     * timestamp is treated as NOT expired (we never delete data we can't age).
     * Exposed for unit testing the retention boundary without Firestore.
     */
    isExpired(updatedAt, now, retentionDays = exports.AI_CHAT_RETENTION_DAYS) {
        if (!updatedAt)
            return false;
        const ageMs = now.getTime() - updatedAt.getTime();
        return ageMs > retentionDays * MS_PER_DAY;
    }
    /** Computes the cutoff Date: records with updatedAt < cutoff are expired. */
    cutoffFor(now, retentionDays = exports.AI_CHAT_RETENTION_DAYS) {
        return new Date(now.getTime() - retentionDays * MS_PER_DAY);
    }
    /**
     * Deletes AI conversations older than [retentionDays] across all users.
     * Scoped exclusively to aiConversations data. Returns the total number of
     * conversations deleted. Best-effort per user: an error for one user is
     * logged and does not abort the sweep.
     */
    async cleanupOlderThan(retentionDays = exports.AI_CHAT_RETENTION_DAYS, now = new Date()) {
        const cutoff = this.cutoffFor(now, retentionDays);
        let total = 0;
        await aiConversationRepository_js_1.aiConversationRepository.forEachUserWithConversations(async (uid) => {
            try {
                total += await aiConversationRepository_js_1.aiConversationRepository.deleteConversationsOlderThan(uid, cutoff);
            }
            catch (err) {
                logger_js_1.logger.warn({ err, uid }, 'AI chat cleanup failed for user');
            }
        });
        return total;
    }
}
exports.AiConversationService = AiConversationService;
exports.aiConversationService = new AiConversationService();
//# sourceMappingURL=aiConversationService.js.map