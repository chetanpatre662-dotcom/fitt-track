"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = require("pino-http");
const env_js_1 = require("./config/env.js");
const logger_js_1 = require("./utils/logger.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const rateLimit_js_1 = require("./middleware/rateLimit.js");
const health_routes_js_1 = __importDefault(require("./routes/health.routes.js"));
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const profile_routes_js_1 = __importDefault(require("./routes/profile.routes.js"));
const exercise_routes_js_1 = __importDefault(require("./routes/exercise.routes.js"));
const workout_routes_js_1 = __importDefault(require("./routes/workout.routes.js"));
const progress_routes_js_1 = __importDefault(require("./routes/progress.routes.js"));
const nutrition_routes_js_1 = __importDefault(require("./routes/nutrition.routes.js"));
const water_routes_js_1 = __importDefault(require("./routes/water.routes.js"));
const routine_routes_js_1 = __importDefault(require("./routes/routine.routes.js"));
const notification_routes_js_1 = __importDefault(require("./routes/notification.routes.js"));
const game_routes_js_1 = __importDefault(require("./routes/game.routes.js"));
const ai_routes_js_1 = __importDefault(require("./routes/ai.routes.js"));
const trainer_routes_js_1 = __importDefault(require("./routes/trainer.routes.js"));
const student_routes_js_1 = __importDefault(require("./routes/student.routes.js"));
/**
 * Builds the Express application. Route modules are mounted here as they are
 * implemented in later slices (auth, profile, workouts, exercises, nutrition,
 * water, routines, progress, ai, notifications).
 */
function createApp() {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            // Mobile apps send no Origin header; allow those and configured web origins.
            if (!origin || env_js_1.corsOrigins.includes(origin) || env_js_1.corsOrigins.includes('*')) {
                cb(null, true);
                return;
            }
            cb(new Error(`Origin not allowed by CORS: ${origin}`));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.use((0, pino_http_1.pinoHttp)({ logger: logger_js_1.logger }));
    app.use('/api', rateLimit_js_1.globalLimiter);
    // --- Routes ---
    app.use('/health', health_routes_js_1.default);
    app.use('/api/auth', auth_routes_js_1.default);
    app.use('/api/profile', profile_routes_js_1.default);
    app.use('/api/exercises', exercise_routes_js_1.default);
    app.use('/api/workouts', workout_routes_js_1.default);
    app.use('/api/progress', progress_routes_js_1.default);
    app.use('/api/nutrition', nutrition_routes_js_1.default);
    app.use('/api/water', water_routes_js_1.default);
    app.use('/api/routines', routine_routes_js_1.default);
    app.use('/api/notifications', notification_routes_js_1.default);
    app.use('/api/games', game_routes_js_1.default);
    app.use('/api/ai', ai_routes_js_1.default);
    app.use('/api/trainer', trainer_routes_js_1.default);
    app.use('/api/student', student_routes_js_1.default);
    app.use(errorHandler_js_1.notFoundHandler);
    app.use(errorHandler_js_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map