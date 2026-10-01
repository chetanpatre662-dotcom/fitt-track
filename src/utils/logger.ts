import pino from 'pino';
import { env, isProduction } from '../config/env.js';

/**
 * Structured logger. Pretty transport is intentionally omitted to keep the
 * dependency surface small and avoid a hard dev-only dependency; JSON logs
 * are fine for both dev and prod and are easy to pipe through `pino-pretty`.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.privateKey'],
    censor: '[redacted]',
  },
  ...(isProduction ? {} : {}),
});

export type Logger = typeof logger;
