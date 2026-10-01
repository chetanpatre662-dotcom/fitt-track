import { getFirestore, admin } from '../config/firebase.js';

export interface UserAccount {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  units: 'metric' | 'imperial';
  onboardingCompleted: boolean;
  fcmTokens: string[];
  createdAt: FirebaseFirestore.Timestamp | admin.firestore.FieldValue;
  updatedAt: FirebaseFirestore.Timestamp | admin.firestore.FieldValue;
}

/**
 * Data access for the top-level users/{uid} account document.
 */
export class UserRepository {
  private get col(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users');
  }

  doc(uid: string): FirebaseFirestore.DocumentReference {
    return this.col.doc(uid);
  }

  /**
   * Ensures a users/{uid} document exists. Creates it on first sign-in with
   * sensible defaults, otherwise returns the existing account. Returns the
   * account plus whether it was newly created.
   */
  async ensureAccount(params: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
  }): Promise<{ account: Record<string, unknown>; created: boolean }> {
    const ref = this.doc(params.uid);
    const snap = await ref.get();

    if (!snap.exists) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const data = {
        uid: params.uid,
        email: params.email,
        emailVerified: params.emailVerified,
        displayName: params.displayName,
        units: 'metric' as const,
        onboardingCompleted: false,
        fcmTokens: [],
        createdAt: now,
        updatedAt: now,
      };
      await ref.set(data);
      return { account: { ...data, createdAt: null, updatedAt: null }, created: true };
    }

    // Keep email/verification status fresh on each verify call.
    const patch: Record<string, unknown> = {
      email: params.email,
      emailVerified: params.emailVerified,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(patch, { merge: true });
    return { account: { ...snap.data(), ...patch }, created: false };
  }

  /** Adds an FCM token to the account (idempotent via arrayUnion). */
  async addFcmToken(uid: string, token: string): Promise<void> {
    await this.doc(uid).set(
      {
        fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  /** Removes an FCM token from the account. */
  async removeFcmToken(uid: string, token: string): Promise<void> {
    await this.doc(uid).set(
      {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(token),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  /**
   * Recursively deletes all data under users/{uid} and the account doc itself.
   * Uses the Admin SDK recursiveDelete which handles subcollections.
   */
  async deleteAllUserData(uid: string): Promise<void> {
    const firestore = getFirestore();
    await firestore.recursiveDelete(this.doc(uid));
  }
}

export const userRepository = new UserRepository();
