import { Router } from 'express';
import { hasFirebaseCredentials, hasGeminiCredentials, env } from '../config/env.js';
import { ok } from '../utils/http.js';

const router = Router();

/**
 * Liveness + configuration status. Safe to expose: reports only whether
 * credentials are present, never their values.
 */
router.get('/', (_req, res) => {
  ok(res, {
    status: 'ok',
    service: 'fittrack-backend',
    time: new Date().toISOString(),
    env: env.NODE_ENV,
    config: {
      firebase: hasFirebaseCredentials(),
      gemini: hasGeminiCredentials(),
    },
  });
});

export default router;
