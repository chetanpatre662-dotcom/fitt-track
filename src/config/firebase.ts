import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';
import { env, hasFirebaseCredentials } from './env.js';
import { ConfigurationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

let app: admin.app.App | null = null;

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
export function initFirebase(): admin.app.App {
  if (app) return app;

  if (!hasFirebaseCredentials()) {
    throw new ConfigurationError(
      'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY ' +
        'or GOOGLE_APPLICATION_CREDENTIALS in your environment. See SETUP.md.',
    );
  }

  let credential: admin.credential.Credential;

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    credential = admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // Env-stored private keys typically have escaped newlines.
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    const path = resolve(process.cwd(), env.GOOGLE_APPLICATION_CREDENTIALS as string);
    const serviceAccount = JSON.parse(readFileSync(path, 'utf-8')) as admin.ServiceAccount;
    credential = admin.credential.cert(serviceAccount);
  }

  app = admin.initializeApp({
    credential,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

  logger.info({ projectId: env.FIREBASE_PROJECT_ID ?? '(from service account)' }, 'Firebase Admin initialized');
  return app;
}

/** Returns the Firestore instance, initializing Firebase if necessary. */
export function getFirestore(): admin.firestore.Firestore {
  const firestore = initFirebase().firestore();
  return firestore;
}

/** Returns the Auth instance, initializing Firebase if necessary. */
export function getAuth(): admin.auth.Auth {
  return initFirebase().auth();
}

/** Returns the Storage bucket, initializing Firebase if necessary. */
export function getBucket() {
  return initFirebase().storage().bucket();
}

/** Returns the Messaging instance, initializing Firebase if necessary. */
export function getMessaging(): admin.messaging.Messaging {
  return initFirebase().messaging();
}

export { admin };
