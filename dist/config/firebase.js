"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin = void 0;
exports.initFirebase = initFirebase;
exports.getFirestore = getFirestore;
exports.getAuth = getAuth;
exports.getBucket = getBucket;
exports.getMessaging = getMessaging;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
exports.admin = firebase_admin_1.default;
const env_js_1 = require("./env.js");
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
let app = null;
/**
 * Lazily initializes the Firebase Admin SDK.
 *
 * Credential resolution order:
 *   1. Inline env vars (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)
 *   2. Service account JSON file (GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Throws ConfigurationError (503) rather than crashing the process when
 * credentials are absent, so the rest of the API can still boot.
 */
function initFirebase() {
    if (app)
        return app;
    if (!(0, env_js_1.hasFirebaseCredentials)()) {
        throw new errors_js_1.ConfigurationError('Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY ' +
            'or GOOGLE_APPLICATION_CREDENTIALS in your environment. See SETUP.md.');
    }
    let credential;
    if (env_js_1.env.FIREBASE_PROJECT_ID && env_js_1.env.FIREBASE_CLIENT_EMAIL && env_js_1.env.FIREBASE_PRIVATE_KEY) {
        credential = firebase_admin_1.default.credential.cert({
            projectId: env_js_1.env.FIREBASE_PROJECT_ID,
            clientEmail: env_js_1.env.FIREBASE_CLIENT_EMAIL,
            // Env-stored private keys typically have escaped newlines.
            privateKey: env_js_1.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
    }
    else {
        const path = (0, node_path_1.resolve)(process.cwd(), env_js_1.env.GOOGLE_APPLICATION_CREDENTIALS);
        const serviceAccount = JSON.parse((0, node_fs_1.readFileSync)(path, 'utf-8'));
        credential = firebase_admin_1.default.credential.cert(serviceAccount);
    }
    app = firebase_admin_1.default.initializeApp({
        credential,
        storageBucket: env_js_1.env.FIREBASE_STORAGE_BUCKET,
    });
    logger_js_1.logger.info({ projectId: env_js_1.env.FIREBASE_PROJECT_ID ?? '(from service account)' }, 'Firebase Admin initialized');
    return app;
}
/** Returns the Firestore instance, initializing Firebase if necessary. */
function getFirestore() {
    const firestore = initFirebase().firestore();
    return firestore;
}
/** Returns the Auth instance, initializing Firebase if necessary. */
function getAuth() {
    return initFirebase().auth();
}
/** Returns the Storage bucket, initializing Firebase if necessary. */
function getBucket() {
    return initFirebase().storage().bucket();
}
/** Returns the Messaging instance, initializing Firebase if necessary. */
function getMessaging() {
    return initFirebase().messaging();
}
//# sourceMappingURL=firebase.js.map