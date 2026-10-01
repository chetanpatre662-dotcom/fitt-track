"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
/**
 * Calls Gemini and returns parsed JSON. Requests structured JSON output
 * (responseMimeType application/json + optional schema). Tries the primary
 * model, then the fallback model on transient errors. Never returns partial
 * or unparseable data — throws so the caller can apply a safe fallback.
 */
async function generateJson(opts) {
    const ai = getClient();
    const models = [env_js_1.env.GEMINI_MODEL, env_js_1.env.GEMINI_MODEL_FALLBACK];
    let lastError;
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
            if (!text)
                throw new Error('Empty response from Gemini');
            return JSON.parse(text);
        }
        catch (err) {
            lastError = err;
            logger_js_1.logger.warn({ err, model }, 'Gemini generateJson attempt failed');
        }
    }
    throw new errors_js_1.ServiceUnavailableError('AI service is temporarily unavailable.', {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
}
/** Plain-text generation (for chat). Falls back across models. */
async function generateText(opts) {
    const ai = getClient();
    const models = [env_js_1.env.GEMINI_MODEL, env_js_1.env.GEMINI_MODEL_FALLBACK];
    let lastError;
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
            if (!text)
                throw new Error('Empty response from Gemini');
            return text;
        }
        catch (err) {
            lastError = err;
            logger_js_1.logger.warn({ err, model }, 'Gemini generateText attempt failed');
        }
    }
    throw new errors_js_1.ServiceUnavailableError('AI service is temporarily unavailable.', {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
    });
}
//# sourceMappingURL=geminiClient.js.map