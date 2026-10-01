import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for the single profile document at users/{uid}/profile/data.
 */
export class ProfileRepository {
  private doc(uid: string): FirebaseFirestore.DocumentReference {
    return getFirestore().collection('users').doc(uid).collection('profile').doc('data');
  }

  async get(uid: string): Promise<Record<string, unknown> | null> {
    const snap = await this.doc(uid).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  }

  /** Upserts the profile document (merge) and stamps updatedAt. */
  async upsert(uid: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.doc(uid);
    const payload = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.set(payload, { merge: true });
    const snap = await ref.get();
    return snap.data() as Record<string, unknown>;
  }
}

export const profileRepository = new ProfileRepository();
