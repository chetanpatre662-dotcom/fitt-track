"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasGeminiCredentials = exports.hasFirebaseCredentials = exports.isTest = exports.isProduction = exports.corsOrigins = exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
/**
 * Centralized, validated environment configuration.
 * Fails fast at startup if required variables are malformed.
 * Firebase / Gemini credentials are intentionally optional so the
 * project can compile and boot for local development without secrets;
 * the relevant services surface a controlled configuration error when
 * they are actually invoked without credentials.
 */
const envSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().int().positive().default(8080),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGINS: zod_1.z.string().default('http://localhost:3000'),
    GOOGLE_APPLICATION_CREDENTIALS: zod_1.z.string().optional(),
    FIREBASE_PROJECT_ID: zod_1.z.string().optional(),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().optional(),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().optional(),
    FIREBASE_STORAGE_BUCKET: zod_1.z.string().optional(),
    GEMINI_API_KEY: zod_1.z.string().optional(),
    GEMINI_MODEL: zod_1.z.string().default('gemini-2.0-flash'),
    GEMINI_MODEL_FALLBACK: zod_1.z.string().default('gemini-2.0-flash-lite'),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().int().positive().default(300),
    AI_RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().positive().default(60_000),
    AI_RATE_LIMIT_MAX: zod_1.z.coerce.number().int().positive().default(15),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed. See errors above.');
}
exports.env = parsed.data;
exports.corsOrigins = exports.env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
exports.isProduction = exports.env.NODE_ENV === 'production';
exports.isTest = exports.env.NODE_ENV === 'test';
/** True when enough Firebase Admin credentials are present to initialize. */
const hasFirebaseCredentials = () => {
    const inline = Boolean(exports.env.FIREBASE_PROJECT_ID && exports.env.FIREBASE_CLIENT_EMAIL && exports.env.FIREBASE_PRIVATE_KEY);
    const file = Boolean(exports.env.GOOGLE_APPLICATION_CREDENTIALS);
    return inline || file;
};
exports.hasFirebaseCredentials = hasFirebaseCredentials;
/** True when a Gemini API key is configured. */
const hasGeminiCredentials = () => Boolean(exports.env.GEMINI_API_KEY);
exports.hasGeminiCredentials = hasGeminiCredentials;
//# sourceMappingURL=env.js.map