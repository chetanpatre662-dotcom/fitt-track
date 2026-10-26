"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyGeminiError = classifyGeminiError;
exports.withGeminiRetry = withGeminiRetry;
exports.__resetModelCapabilityCache = __resetModelCapabilityCache;
exports.generateJson = generateJson;
exports.generateText = generateText;
const genai_1 = require("@google/genai");
const env_js_1 = require("../config/env.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
let client = null;
function getClient() {
    if (!(0, env_js_1.hasGeminiCredentials)()) {
        throw new errors_js_1.ConfigurationError('Gemini is not configured. Set GEMINI_API_KEY in the backend environment. See docs/AI.md.');
    }
    client ??= new genai_1.GoogleGenAI({ apiKey: env_js_1.env.GEMINI_API_KEY });
    return client;
}
/** Best-effort numeric HTTP status from the several shapes the SDK throws. */
function statusOf(err) {
    const e = err;
    if (!e || typeof e !== 'object')
        return undefined;
    const candidates = [e.status, e.code, e.response?.status];
    for (const c of candidates) {
        if (typeof c === 'number' && Number.isFinite(c))
            return c;
        if (typeof c === 'string' && /^\d+$/u.test(c))
            return Number(c);
    }
    return undefined;
}
function isAbortError(err) {
    const e = err;
    if (!e || typeof e !== 'object')
        return false;
    const name = typeof e.name === 'string' ? e.name : '';
    return (name === 'AbortError' ||
        name === 'APIUserAbortError' ||
        name === 'APIConnectionTimeoutError');
}
function isTransientNetworkError(err) {
    const e = err;
    if (!e || typeof e !== 'object')
        return false;
    const name = typeof e.name === 'string' ? e.name : '';
    const code = typeof e.code === 'string' ? e.code : '';
    return (name === 'APIConnectionError' ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN');
}
/**
 * Maps a thrown error to a retry class. Timeouts/aborts first (they also lack a
 * status), then explicit statuses, then transient network faults. Anything with
 * an unknown or undefined status is treated as `permanent` (never retried).
 */
function classifyGeminiError(err) {
    if (isAbortError(err))
        return 'timeout';
    const status = statusOf(err);
    if (status === 429)
        return 'rate_limited';
    if (status === 503)
        return 'transient';
    if (typeof status === 'number') {
        // 400/401/403/404 and any other explicit non-retryable status.
        return 'permanent';
    }
    if (isTransientNetworkError(err))
        return 'transient';
    return 'permanent';
}
/** Reads a numeric Retry-After (seconds) header from the error, if present. */
function retryAfterMs(err) {
    const headers = err?.headers;
    const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
    if (!raw)
        return undefined;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0)
        return seconds * 1000;
    // HTTP-date form is not honored here (we fall back to computed backoff).
    return undefined;
}
// --- Bounded retry ---------------------------------------------------------
const RETRY_CAP_MS = 8_000;
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * Runs `fn` with a bounded retry policy: retries ONLY transient/rate_limited
 * errors, within BOTH GEMINI_MAX_RETRIES attempts and the
 * GEMINI_RETRY_MAX_ELAPSED_MS total-time budget. Backoff is
 * min(base * 2^attempt, cap) + jitter, honoring a Retry-After header when the
 * server sends one. Logs only non-PII fields. Re-throws the last error.
 */
async function withGeminiRetry(fn, ctx) {
    const start = Date.now();
    const maxRetries = env_js_1.env.GEMINI_MAX_RETRIES;
    let attempt = 0;
    for (;;) {
        const callStart = Date.now();
        try {
            return await fn();
        }
        catch (err) {
            const classification = classifyGeminiError(err);
            const durationMs = Date.now() - callStart;
            const status = statusOf(err);
            // A client disconnect / caller abort is an expected, non-error outcome.
            if (classification === 'timeout' && ctx.signal?.aborted) {
                logger_js_1.logger.info({ model: ctx.model, attempt, durationMs }, 'Gemini call aborted (client/deadline)');
                throw err;
            }
            const retryable = classification === 'transient' || classification === 'rate_limited';
            const elapsed = Date.now() - start;
            const canRetry = retryable && attempt < maxRetries;
            if (!canRetry) {
                logger_js_1.logger.warn({ model: ctx.model, attempt, durationMs, classification, status }, 'Gemini call failed (no more retries)');
                throw err;
            }
            const backoff = Math.min(env_js_1.env.GEMINI_RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
            const jitter = Math.floor(Math.random() * env_js_1.env.GEMINI_RETRY_BASE_MS);
            const waitMs = Math.max(retryAfterMs(err) ?? 0, backoff + jitter);
            if (elapsed + waitMs >= env_js_1.env.GEMINI_RETRY_MAX_ELAPSED_MS) {
                logger_js_1.logger.warn({ model: ctx.model, attempt, durationMs, classification, status }, 'Gemini call failed (time budget exhausted)');
                throw err;
            }
            logger_js_1.logger.warn({ model: ctx.model, attempt, durationMs, classification, status }, 'Gemini call failed (retrying)');
            attempt += 1;
            await sleep(waitMs, ctx.signal);
        }
    }
}
// --- Capability check ------------------------------------------------------
let supportedModels = null;
let supportedModelsPromise = null;
/**
 * Test-only: clears the cached model-capability Set so each case can mock a
 * different `ai.models.list()` outcome. Not used in production code paths.
 */
function __resetModelCapabilityCache() {
    supportedModels = null;
    supportedModelsPromise = null;
}
/** Normalizes a model id to the bare name (strips a `models/` prefix). */
function normalizeModelName(name) {
    return name.startsWith('models/') ? name.slice('models/'.length) : name;
}
/**
 * Best-effort, cached discovery of the models the configured key can use.
 * Iterates every page of `ai.models.list()` behind ONE shared in-flight
 * promise. On any failure the result is `null` and the capability check is
 * skipped (we never hard-fail AI on a listing problem).
 */
async function getSupportedModels(ai) {
    if (supportedModels)
        return supportedModels;
    supportedModelsPromise ??= (async () => {
        try {
            const pager = await ai.models.list();
            const names = new Set();
            for await (const model of pager) {
                if (model.name)
                    names.add(normalizeModelName(model.name));
            }
            supportedModels = names;
            return names;
        }
        catch (err) {
            logger_js_1.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Gemini model capability listing failed; skipping capability check');
            return null;
        }
        finally {
            supportedModelsPromise = null;
        }
    })();
    return supportedModelsPromise;
}
/**
 * Decides the ordered list of models to try, using the best-effort capability
 * table. When listing is unavailable (null) the check is skipped and the
 * primary (then fallback) is attempted as-is. Membership rules:
 *  - primary present                  -> [primary, fallback]
 *  - primary absent, fallback present -> warn, [fallback]
 *  - both absent                      -> warn, [primary, fallback] (proceed)
 */
function resolveModelOrder(supported) {
    const primary = env_js_1.env.GEMINI_MODEL;
    const fallback = env_js_1.env.GEMINI_MODEL_FALLBACK;
    const order = primary === fallback ? [primary] : [primary, fallback];
    if (!supported)
        return order;
    const hasPrimary = supported.has(normalizeModelName(primary));
    const hasFallback = supported.has(normalizeModelName(fallback));
    if (hasPrimary)
        return order;
    if (hasFallback) {
        logger_js_1.logger.warn({ model: primary }, 'Primary Gemini model not listed; starting with fallback');
        return [fallback];
    }
    logger_js_1.logger.warn({ model: primary, fallback }, 'Neither Gemini model listed; proceeding with primary (capability check inconclusive)');
    return order;
}
/**
 * Builds the effective AbortSignal for one Gemini call: a fresh timeout signal
 * (armed to GEMINI_REQUEST_TIMEOUT_MS) composed with an optional caller signal.
 * Uses AbortSignal.any when available; otherwise a manual linker.
 */
function armTimeout(caller) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env_js_1.env.GEMINI_REQUEST_TIMEOUT_MS);
    const signals = [controller.signal];
    if (caller)
        signals.push(caller);
    let signal;
    let onCallerAbort;
    if (typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any(signals);
    }
    else if (caller) {
        // Manual linker: abort the local controller when the caller aborts.
        if (caller.aborted)
            controller.abort();
        else {
            onCallerAbort = () => controller.abort();
            caller.addEventListener('abort', onCallerAbort, { once: true });
        }
        signal = controller.signal;
    }
    else {
        signal = controller.signal;
    }
    return {
        signal,
        cleanup: () => {
            clearTimeout(timer);
            if (onCallerAbort && caller)
                caller.removeEventListener('abort', onCallerAbort);
        },
    };
}
/**
 * Calls Gemini and returns parsed JSON. Requests structured JSON output
 * (responseMimeType application/json + optional schema). Walks the
 * capability-resolved model order, each model wrapped in the bounded retry
 * policy and an AbortSignal-based per-call timeout. Never returns partial or
 * unparseable data — throws ServiceUnavailableError so the caller can apply a
 * safe fallback.
 */
async function generateJson(opts) {
    const ai = getClient();
    const supported = await getSupportedModels(ai);
    const models = resolveModelOrder(supported);
    let lastError;
    for (const model of models) {
        try {
            return await withGeminiRetry(async () => {
                const call = armTimeout(opts.signal);
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: opts.prompt,
                        config: {
                            systemInstruction: opts.systemInstruction,
                            responseMimeType: 'application/json',
                            ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
                            temperature: opts.temperature ?? 0.7,
                            abortSignal: call.signal,
                        },
                    });
                    const text = response.text;
                    if (!text)
                        throw new Error('Empty response from Gemini');
                    return JSON.parse(text);
                }
                finally {
                    call.cleanup();
                }
            }, { model, signal: opts.signal });
        }
        catch (err) {
            lastError = err;
            // A caller/deadline abort is terminal — do not fall through to another model.
            if (opts.signal?.aborted)
                break;
        }
    }
    throw new errors_js_1.ServiceUnavailableError('AI service is temporarily unavailable.', {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
}
/** Plain-text generation (for chat). Same retry + capability + timeout path. */
async function generateText(opts) {
    const ai = getClient();
    const supported = await getSupportedModels(ai);
    const models = resolveModelOrder(supported);
    let lastError;
    for (const model of models) {
        try {
            return await withGeminiRetry(async () => {
                const call = armTimeout(opts.signal);
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: opts.prompt,
                        config: {
                            systemInstruction: opts.systemInstruction,
                            temperature: opts.temperature ?? 0.8,
                            abortSignal: call.signal,
                        },
                    });
                    const text = response.text;
                    if (!text)
                        throw new Error('Empty response from Gemini');
                    return text;
                }
                finally {
                    call.cleanup();
                }
            }, { model, signal: opts.signal });
        }
        catch (err) {
            lastError = err;
            if (opts.signal?.aborted)
                break;
        }
    }
    throw new errors_js_1.ServiceUnavailableError('AI service is temporarily unavailable.', {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
}
//# sourceMappingURL=geminiClient.js.map