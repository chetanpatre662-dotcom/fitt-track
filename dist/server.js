"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const env_js_1 = require("./config/env.js");
const logger_js_1 = require("./utils/logger.js");
const app = (0, app_js_1.createApp)();
const server = app.listen(env_js_1.env.PORT, () => {
    logger_js_1.logger.info(`FitTrack backend listening on http://localhost:${env_js_1.env.PORT} [${env_js_1.env.NODE_ENV}]`);
});
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