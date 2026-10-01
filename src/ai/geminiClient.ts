import { GoogleGenAI } from '@google/genai';
import { env, hasGeminiCredentials } from '../config/env.js';
import { ConfigurationError, ServiceUnavailableError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!hasGeminiCredentials()) {
    throw new ConfigurationError(
      'Gemini is not configured. Set GEMINI_API_KEY in the backend environment. See docs/AI.md.',
    );
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY as string });
  return client;
}

export interface GenerateJsonOptions {
  /** System instruction guiding tone + safety. */
  systemInstruction: string;
  /** The user/content prompt. */
  prompt: string;
  /** Optional JSON schema (Gemini responseSchema) constraining the output. */
  responseSchema?: Record<string, unknown>;
  /** Sampling temperature. */
  temperature?: number;
}

/**
 * Calls Gemini and returns parsed JSON. Requests structured JSON output
 * (responseMimeType application/json + optional schema). Tries the primary
 * model, then the fallback model on transient errors. Never returns partial
 * or unparseable data — throws so the caller can apply a safe fallback.
 */
export async function generateJson<T = unknown>(opts: GenerateJsonOptions): Promise<T> {
  const ai = getClient();
  const models = [env.GEMINI_MODEL, env.GEMINI_MODEL_FALLBACK];

  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
          temperature: opts.temperature ?? 0.7,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;
      logger.warn({ err, model }, 'Gemini generateJson attempt failed');
    }
  }
  throw new ServiceUnavailableError('AI service is temporarily unavailable.', {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

/** Plain-text generation (for chat). Falls back across models. */
export async function generateText(opts: {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
}): Promise<string> {
  const ai = getClient();
  const models = [env.GEMINI_MODEL, env.GEMINI_MODEL_FALLBACK];

  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.systemInstruction,
          temperature: opts.temperature ?? 0.8,
        },
      });
      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text;
    } catch (err) {
      lastError = err;
      logger.warn({ err, model }, 'Gemini generateText attempt failed');
    }
  }
  throw new ServiceUnavailableError('AI service is temporarily unavailable.', {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}
