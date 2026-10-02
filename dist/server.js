"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const env_js_1 = require("./config/env.js");
const logger_js_1 = require("./utils/logger.js");
const aiConversationService_js_1 = require("./services/aiConversationService.js");
const app = (0, app_js_1.createApp)();
const server = app.listen(env_js_1.env.PORT, () => {
    logger_js_1.logger.info(`FitTrack backend listening on http://localhost:${env_js_1.env.PORT} [${env_js_1.env.NODE_ENV}]`);
});
/**
 * AI chat 30-day retention sweep.
 *
 * Smallest production-safe cleanup for the current PM2/Express deployment: an
 * in-process scheduler that runs once shortly after boot and then every 24h.
 * It does NOT depend on the Flutter app being opened. Scoped exclusively to AI
 * chat data (users/{uid}/aiConversations) — no other collections are touched.
 * Best-effort: failures are logged and never crash the server. The interval is
 * unref'd so it never blocks graceful shutdown.
 */
const AI_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const AI_CLEANUP_BOOT_DELAY_MS = 30 * 1000; // let the server settle first
async function runAiChatCleanup() {
    try {
        const deleted = await aiConversationService_js_1.aiConversationService.cleanupOlderThan(aiConversationService_js_1.AI_CHAT_RETENTION_DAYS);
        logger_js_1.logger.info({ deleted, retentionDays: aiConversationService_js_1.AI_CHAT_RETENTION_DAYS }, 'AI chat retention sweep complete');
    }
    catch (err) {
        logger_js_1.logger.warn({ err }, 'AI chat retention sweep failed');
    }
}
const aiCleanupBootTimer = setTimeout(() => void runAiChatCleanup(), AI_CLEANUP_BOOT_DELAY_MS);
aiCleanupBootTimer.unref();
const aiCleanupInterval = setInterval(() => void runAiChatCleanup(), AI_CLEANUP_INTERVAL_MS);
aiCleanupInterval.unref();
// Graceful shutdown
const shutdown = (signal) => {
    logger_js_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
        logger_js_1.logger.info('HTTP server closed.');
        process.exit(0);
    });
    // Force-exit if connections linger.
    setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    logger_js_1.logger.error({ reason }, 'Unhandled promise rejection');
});
//# sourceMappingURL=server.js.map