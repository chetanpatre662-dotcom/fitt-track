import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

/**
 * Smoke test: the app builds and the health endpoint responds.
 * Uses Node's built-in fetch against an ephemeral server instance.
 */
describe('health endpoint', () => {
  it('returns ok status and config flags', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        data: { status: string; config: { firebase: boolean; gemini: boolean } };
      };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
      expect(typeof body.data.config.firebase).toBe('boolean');
      expect(typeof body.data.config.gemini).toBe('boolean');
    } finally {
      server.close();
    }
  });
});
