import { getFirestore } from '../config/firebase.js';
import { userRepository } from '../repositories/userRepository.js';
import { trainerLinkRepository } from '../repositories/trainerLinkRepository.js';

/**
 * The three application roles. Role is always server-trusted, never
 * client-supplied:
 *   - 'user'    = normal user, not connected to a trainer
 *   - 'student' = user connected to a trainer (via a non-terminal trainerLink)
 *   - 'trainer' = trainer account
 */
export type AccountRole = 'user' | 'student' | 'trainer';

/**
 * Resolves the server-trusted role for a uid. The role is computed, never read
 * from the client, in this exact order:
 *   1. Read the stored role (users/{uid}.role); null when absent.
 *   2. If the stored role is 'trainer', OR a trainers/{uid} doc exists, the
 *      account is a 'trainer'. This precedes the link read so a trainer that
 *      somehow also has a trainerLinks/{uid} doc still resolves to 'trainer'.
 *   3. If an explicit non-trainer role ('student' | 'user') was ever written,
 *      honor it. (Not written in practice — these roles are derived.)
 *   4. Otherwise, if a trainerLinks/{uid} doc exists and is non-terminal
 *      (status 'active' or 'pending'), the account is a 'student'. Terminal
 *      states ('rejected' | 'inactive') do not count.
 *   5. Otherwise the account is a normal 'user' (default for legacy accounts
 *      that predate the role field and have no trainer link).
 *
 * This never writes the role back — it is purely derived (only 'trainer' has a
 * durable artifact: users/{uid}.role + trainers/{uid}), so legacy accounts stay
 * untouched and no migration is needed.
 */
export class RoleService {
  async resolveRole(uid: string): Promise<AccountRole> {
    const stored = await userRepository.getRole(uid);

    if (stored === 'trainer') return 'trainer';
    const trainerSnap = await getFirestore().collection('trainers').doc(uid).get();
    if (trainerSnap.exists) return 'trainer';

    if (stored === 'student' || stored === 'user') return stored;

    const link = await trainerLinkRepository.get(uid);
    if (link && (link.status === 'active' || link.status === 'pending')) {
      return 'student';
    }

    return 'user';
  }
}

export const roleService = new RoleService();
