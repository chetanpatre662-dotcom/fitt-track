import { getAuth, getBucket } from '../config/firebase.js';
import { userRepository } from '../repositories/userRepository.js';
import { roleService } from './roleService.js';
import { logger } from '../utils/logger.js';

/**
 * Auth-related business logic that requires the Admin SDK.
 */
export class AuthService {
  /**
   * Called after the client signs in. Ensures the account document exists and
   * returns account metadata. UID/email are taken from the verified token by
   * the caller, never from the request body.
   */
  async verifyAndSync(params: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
  }): Promise<Record<string, unknown>> {
    const { account } = await userRepository.ensureAccount(params);
    // Inject the server-trusted role. It is resolved (never taken from the
    // client) and never written back by this call, so legacy accounts stay
    // untouched while still routing correctly.
    const role = await roleService.resolveRole(params.uid);
    return { ...account, role };
  }

  /**
   * Fully deletes a user: Firestore data, their Storage folder, and the
   * Firebase Auth account. Ordered so that if auth deletion fails, data is
   * already gone and can be retried; the auth account removal is last.
   */
  async deleteAccount(uid: string): Promise<void> {
    // 1. Firestore data (recursive).
    await userRepository.deleteAllUserData(uid);

    // 2. Storage files under users/{uid}/.
    try {
      await getBucket().deleteFiles({ prefix: `users/${uid}/` });
    } catch (err) {
      // Non-fatal: bucket may not exist in some environments. Log and continue.
      logger.warn({ err, uid }, 'Failed to delete user storage files (continuing)');
    }

    // 3. Firebase Auth account.
    await getAuth().deleteUser(uid);
  }
}

export const authService = new AuthService();
