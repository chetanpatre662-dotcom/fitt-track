import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';

const tooMany = {
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please slow down.' },
};

/**
 * Keys rate limiting by authenticated UID when available, otherwise by IP.
 * This prevents one heavy user from exhausting a shared-IP quota and vice-versa.
 */
function keyByUidOrIp(req: Request): string {
  return req.uid ?? req.ip ?? 'unknown';
}

/** Global limiter applied to all /api traffic. */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUidOrIp,
  message: tooMany,
});

/** Stricter limiter for AI endpoints (Gemini calls are expensive). */
export const aiLimiter = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  max: env.AI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUidOrIp,
  message: {
    success: false,
    error: { code: 'TOO_MANY_REQUESTS', message: 'AI request limit reached. Please wait a moment and try again.' },
  },
});
