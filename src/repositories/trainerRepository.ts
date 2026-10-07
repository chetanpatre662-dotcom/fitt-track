import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for the top-level trainers/{trainerId} profile document and the
 * referralCodes/{codeLower} lookup collection.
 *
 * Both collections are backend-Admin-SDK-write-only and never client-readable
 * (enforced by firestore.rules); all access goes through the Admin SDK here.
 */
export class TrainerRepository {
  private get trainersCol(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('trainers');
  }

  private get referralCodesCol(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('referralCodes');
  }

  /** Returns trainers/{trainerId} or null. */
  async get(trainerId: string): Promise<Record<string, unknown> | null> {
    const snap = await this.trainersCol.doc(trainerId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /** Idempotently upserts trainers/{trainerId} (merge). */
  async upsert(trainerId: string, data: Record<string, unknown>): Promise<void> {
    await this.trainersCol.doc(trainerId).set(data, { merge: true });
  }

  /**
   * Looks up a referral code (expects an already-normalized, lowercased code)
   * and returns the owning trainerId, or null when the code is unknown.
   */
  async findTrainerIdByReferralCode(codeLower: string): Promise<string | null> {
    const snap = await this.referralCodesCol.doc(codeLower).get();
    if (!snap.exists) return null;
    const trainerId = snap.data()?.trainerId;
    return typeof trainerId === 'string' ? trainerId : null;
  }

  /** Idempotently upserts referralCodes/{codeLower} -> { trainerId }. */
  async setReferralCode(codeLower: string, trainerId: string): Promise<void> {
    await this.referralCodesCol.doc(codeLower).set({ trainerId }, { merge: true });
  }

  /**
   * Authoritative live count of a trainer's active students, computed from
   * trainerLinks rather than the stored counter so the dashboard total never
   * drifts.
   */
  async countActiveStudents(trainerId: string): Promise<number> {
    const snap = await getFirestore()
      .collection('trainerLinks')
      .where('trainerId', '==', trainerId)
      .where('status', '==', 'active')
      .get();
    return snap.size;
  }

  /** FieldValue increment helper for the stored totalStudents counter. */
  incrementTotalStudents(trainerId: string, by: number): Promise<FirebaseFirestore.WriteResult> {
    return this.trainersCol.doc(trainerId).set(
      {
        totalStudents: admin.firestore.FieldValue.increment(by),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

export const trainerRepository = new TrainerRepository();
