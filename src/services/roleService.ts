import { getFirestore } from '../config/firebase.js';
import { userRepository } from '../repositories/userRepository.js';

/** The two account roles. Role is always server-trusted, never client-supplied. */
export type AccountRole = 'student' | 'trainer';

/**
 * Resolves the server-trusted role for a uid. The role is computed, never read
 * from the client:
 *   1. If users/{uid}.role is set, use it.
 *   2. Otherwise, if a trainers/{uid} doc exists, the account is a 'trainer'.
 *   3. Otherwise the account is a normal 'student' (default for legacy accounts
 *      that predate the role field).
 *
 * This never writes the role back — it is purely derived so a legacy account
 * stays untouched until something explicitly sets its role (e.g. the trainer
 * seed script).
 */
export class RoleService {
  async resolveRole(uid: string): Promise<AccountRole> {
    const stored = await userRepository.getRole(uid);
    if (stored === 'trainer' || stored === 'student') return stored;

    const trainerSnap = await getFirestore().collection('trainers').doc(uid).get();
    return trainerSnap.exists ? 'trainer' : 'student';
  }
}

export const roleService = new RoleService();
