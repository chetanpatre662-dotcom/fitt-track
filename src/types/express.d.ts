import type { auth } from 'firebase-admin';

/**
 * Augments Express Request with the authenticated user context that
 * `authenticate` attaches after verifying the Firebase ID token.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Verified Firebase UID. Never sourced from client input. */
      uid?: string;
      /** Decoded Firebase ID token claims. */
      auth?: auth.DecodedIdToken;
    }
  }
}

export {};
