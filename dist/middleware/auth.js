"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
exports.requireUid = requireUid;
const firebase_js_1 = require("../config/firebase.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const http_js_1 = require("../utils/http.js");
/**
 * Hard cap for the Firebase Admin token verification call. The SDK itself does
 * not bound this network operation, so a stalled outbound request to Google's
 * servers would otherwise leave the HTTP request hanging until the client's own
 * (much longer) timeout fires. Failing fast turns that silent hang into a clear
 * 503 the client can surface and retry.
 */
const VERIFY_TOKEN_TIMEOUT_MS = 8_000;
/** Rejects with a ServiceUnavailableError if [promise] does not settle in time. */
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new errors_js_1.ServiceUnavailableError('Authentication service timed out. Please try again.'));
        }, ms);
        timer.unref?.();
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/**
 * Extracts a Bearer token from the Authorization header.
 * Returns null when absent or malformed.
 */
function extractBearerToken(req) {
    const header = req.headers.authorization;
    if (!header)
        return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
        return null;
    return token.trim();
}
/**
 * Authentication middleware.
 *
 * Verifies the Firebase ID token with the Admin SDK and attaches the verified
 * UID and decoded claims to the request. The UID is ALWAYS derived from the
 * verified token — never from the request body, query, or params.
 *
 * Throws UnauthorizedError (401) on any failure; raw Firebase errors are never
 * surfaced to the client.
 */
exports.authenticate = (0, http_js_1.asyncHandler)(async (req, _res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
        throw new errors_js_1.UnauthorizedError('Missing or malformed Authorization header. Expected: Bearer <idToken>.');
    }
    let decoded;
    try {
        // Verify signature + expiry against the SDK's cached public keys. We do NOT
        // pass checkRevoked=true: that flag forces an extra outbound network call to
        // the Firebase Auth backend on EVERY request, which can stall indefinitely
        // on restrictive/slow networks and surface to the client as a request
        // timeout. Standard token verification needs no per-request network hop.
        decoded = await withTimeout((0, firebase_js_1.getAuth)().verifyIdToken(token), VERIFY_TOKEN_TIMEOUT_MS);
    }
    catch (err) {
        // A configuration/availability problem (missing Firebase credentials, or a
        // timed-out verification) is NOT the client's fault — surface it as 503 so
        // the app shows an actionable message instead of a misleading 401.
        if (err instanceof errors_js_1.AppError && err.statusCode >= 500) {
            logger_js_1.logger.error({ code: err.code }, 'Token verification failed (service error)');
            throw err;
        }
        // Any other failure means the token itself is invalid/expired. Log the
        // Firebase error code only (never the token or its contents).
        const code = err?.code;
        logger_js_1.logger.warn({ firebaseCode: code }, 'Rejected request with invalid auth token');
        throw new errors_js_1.UnauthorizedError('Invalid or expired authentication token.');
    }
    req.uid = decoded.uid;
    req.auth = decoded;
    next();
});
/**
 * Guard that returns the verified UID or throws. Use inside controllers to
 * satisfy the type checker without repeating null checks.
 */
function requireUid(req) {
    if (!req.uid) {
        throw new errors_js_1.UnauthorizedError('Authentication required.');
    }
    return req.uid;
}
//# sourceMappingURL=auth.js.map