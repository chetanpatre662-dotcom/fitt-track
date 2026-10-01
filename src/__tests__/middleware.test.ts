import { describe, it, expect } from 'vitest';
import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { errorHandler } from '../middleware/errorHandler.js';

/** Spins up a tiny app with a single route and returns its base URL + closer. */
function serve(build: (app: express.Express) => void): { url: string; close: () => void } {
  const app = express();
  app.use(express.json());
  build(app);
  app.use(errorHandler);
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

describe('authenticate middleware', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const { url, close } = serve((app) => {
      app.get('/secure', authenticate, (_req, res) => res.json({ success: true }));
    });
    try {
      const res = await fetch(`${url}/secure`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    } finally {
      close();
    }
  });

  it('rejects malformed Authorization scheme (401)', async () => {
    const { url, close } = serve((app) => {
      app.get('/secure', authenticate, (_req, res) => res.json({ success: true }));
    });
    try {
      const res = await fetch(`${url}/secure`, { headers: { Authorization: 'Basic abc123' } });
      expect(res.status).toBe(401);
    } finally {
      close();
    }
  });
});

describe('validate middleware', () => {
  it('returns 422 with details for invalid body', async () => {
    const schema = z.object({ email: z.string().email(), age: z.number().int().positive() });
    const { url, close } = serve((app) => {
      app.post('/echo', validate({ body: schema }), (req, res) => res.json({ success: true, data: req.body }));
    });
    try {
      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', age: -1 }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { success: boolean; error: { code: string; details: unknown } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
    } finally {
      close();
    }
  });

  it('passes and coerces valid body', async () => {
    const schema = z.object({ name: z.string().min(1) });
    const { url, close } = serve((app) => {
      app.post('/echo', validate({ body: schema }), (req, res) => res.json({ success: true, data: req.body }));
    });
    try {
      const res = await fetch(`${url}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alex' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { name: string } };
      expect(body.data.name).toBe('Alex');
    } finally {
      close();
    }
  });
});
