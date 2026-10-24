import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Gemini client resilience (FEAT-001 Part 4). Mocks GoogleGenAI so
 * models.generateContent AND models.list are fully controllable; env is mocked
 * with tiny retry budgets so backoff waits are near-instant.
 *
 * NOTE: these tests mock the SDK. A green run here proves the retry /
 * classification / capability / abort LOGIC is correct — it does NOT prove the
 * live Gemini endpoint is fixed (that needs a credentialed deploy smoke test
 * against a real GEMINI_MODEL).
 */

const generateContent = vi.fn();
const list = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (...args: unknown[]) => generateContent(...args),
      list: (...args: unknown[]) => list(...args),
    };
  },
}));

vi.mock('../config/env.js', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-primary',
    GEMINI_MODEL_FALLBACK: 'gemini-fallback',
    GEMINI_MAX_RETRIES: 2,
    GEMINI_RETRY_BASE_MS: 1,
    GEMINI_RETRY_MAX_ELAPSED_MS: 2000,
    GEMINI_REQUEST_TIMEOUT_MS: 50,
  },
  hasGeminiCredentials: () => true,
}));

// Stub the logger so the mocked env (which omits LOG_LEVEL/isProduction) never
// reaches pino's config. Keeps this suite focused on the client logic.
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  generateJson,
  generateText,
  classifyGeminiError,
  __resetModelCapabilityCache,
} from '../ai/geminiClient.js';
import { ServiceUnavailableError } from '../utils/errors.js';

/** An async pager over a fixed list of model names. */
function pagerOf(names: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const name of names) yield { name };
    },
  };
}

function apiError(status: number, headers?: Record<string, string>) {
  const err = Object.assign(new Error(`status ${status}`), { status }) as Error & {
    headers?: { get: (k: string) => string | null };
  };
  if (headers) {
    err.headers = { get: (k: string) => headers[k.toLowerCase()] ?? null };
  }
  return err;
}

function okJson(obj: unknown) {
  return { text: JSON.stringify(obj) };
}

beforeEach(() => {
  generateContent.mockReset();
  list.mockReset();
  __resetModelCapabilityCache();
  // Default: both configured models are listed so the capability table passes
  // the primary straight through.
  list.mockResolvedValue(pagerOf(['gemini-primary', 'gemini-fallback']));
});

describe('classifyGeminiError', () => {
  it('maps statuses and aborts to the right class', () => {
    expect(classifyGeminiError(apiError(429))).toBe('rate_limited');
    expect(classifyGeminiError(apiError(503))).toBe('transient');
    expect(classifyGeminiError(apiError(400))).toBe('permanent');
    expect(classifyGeminiError(apiError(401))).toBe('permanent');
    expect(classifyGeminiError(apiError(403))).toBe('permanent');
    expect(classifyGeminiError(apiError(404))).toBe('permanent');
    // Unknown / undefined status => permanent (never retried).
    expect(classifyGeminiError(new Error('mystery'))).toBe('permanent');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(classifyGeminiError(abort)).toBe('timeout');
  });
});

describe('generateJson retry + fallback', () => {
  it('success on the first attempt', async () => {
    generateContent.mockResolvedValueOnce(okJson({ ok: true }));
    const out = await generateJson<{ ok: boolean }>({ systemInstruction: 's', prompt: 'p' });
    expect(out).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('transient 503 then success (one retry)', async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce(okJson({ ok: 1 }));
    const out = await generateJson<{ ok: number }>({ systemInstruction: 's', prompt: 'p' });
    expect(out).toEqual({ ok: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('repeated 503 is bounded (attempts = 1 + maxRetries per model, then fallback)', async () => {
    generateContent.mockRejectedValue(apiError(503));
    await expect(generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    // 3 attempts on primary (1 + 2 retries) + 3 on fallback = 6.
    expect(generateContent).toHaveBeenCalledTimes(6);
  });

  it('429 with Retry-After is honored then succeeds', async () => {
    generateContent
      .mockRejectedValueOnce(apiError(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(okJson({ ok: true }));
    const out = await generateJson<{ ok: boolean }>({ systemInstruction: 's', prompt: 'p' });
    expect(out).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('400 is permanent — no retry, falls to fallback once, then 503', async () => {
    generateContent.mockRejectedValue(apiError(400));
    await expect(generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    // One attempt per model, no retries.
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('unknown/undefined status => no retry', async () => {
    generateContent.mockRejectedValue(new Error('weird'));
    await expect(generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('primary fails -> fallback succeeds (schema is re-sent)', async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce(okJson({ ok: 'fb' }));
    const out = await generateJson<{ ok: string }>({
      systemInstruction: 's',
      prompt: 'p',
      responseSchema: { type: 'object' },
    });
    expect(out).toEqual({ ok: 'fb' });
    // The fallback call still carried the responseSchema in its config.
    const lastCall = generateContent.mock.calls.at(-1)?.[0] as { config: { responseSchema?: unknown } };
    expect(lastCall.config.responseSchema).toEqual({ type: 'object' });
  });

  it('malformed JSON throws -> ServiceUnavailableError (caller applies safe fallback)', async () => {
    generateContent.mockResolvedValue({ text: 'not json {' });
    await expect(generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it('a deadline timeout aborts the call (classified as timeout, not a crash)', async () => {
    // generateContent hangs until its abortSignal fires; the per-call timeout
    // (50ms) aborts it. The retry treats timeout as non-retryable-by-caller
    // (no caller signal) and surfaces a controlled 503.
    generateContent.mockImplementation((args: { config: { abortSignal?: AbortSignal } }) => {
      return new Promise((_resolve, reject) => {
        const sig = args.config.abortSignal;
        sig?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    });
    await expect(generateJson({ systemInstruction: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });
});

describe('capability table', () => {
  it('primary absent, fallback present => starts with the fallback model only', async () => {
    list.mockResolvedValue(pagerOf(['gemini-fallback']));
    generateContent.mockResolvedValueOnce(okJson({ ok: true }));
    await generateJson({ systemInstruction: 's', prompt: 'p' });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const call = generateContent.mock.calls[0][0] as { model: string };
    expect(call.model).toBe('gemini-fallback');
  });

  it('both absent => proceeds with the primary order anyway', async () => {
    list.mockResolvedValue(pagerOf(['some-other-model']));
    generateContent.mockResolvedValueOnce(okJson({ ok: true }));
    await generateJson({ systemInstruction: 's', prompt: 'p' });
    const call = generateContent.mock.calls[0][0] as { model: string };
    expect(call.model).toBe('gemini-primary');
  });

  it('list() throwing => capability check skipped, call still proceeds', async () => {
    list.mockRejectedValue(new Error('list failed'));
    generateContent.mockResolvedValueOnce(okJson({ ok: true }));
    const out = await generateJson<{ ok: boolean }>({ systemInstruction: 's', prompt: 'p' });
    expect(out).toEqual({ ok: true });
  });
});

describe('generateText', () => {
  it('returns plain text and passes abortSignal in config', async () => {
    generateContent.mockResolvedValueOnce({ text: 'hello coach' });
    const out = await generateText({ systemInstruction: 's', prompt: 'p' });
    expect(out).toBe('hello coach');
    const call = generateContent.mock.calls[0][0] as { config: { abortSignal?: AbortSignal } };
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('transient 503 then success', async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ text: 'ok' });
    const out = await generateText({ systemInstruction: 's', prompt: 'p' });
    expect(out).toBe('ok');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
