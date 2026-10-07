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

  /** Document ref for a trainer record (used inside transactions). */
  trainerDoc(trainerId: string): FirebaseFirestore.DocumentReference {
    return this.trainersCol.doc(trainerId);
  }

  /** Document ref for a referral-code index entry (used inside transactions). */
  referralCodeDoc(codeLower: string): FirebaseFirestore.DocumentReference {
    return this.referralCodesCol.doc(codeLower);
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

  /**
   * Reads the full referralCodes/{codeLower} index doc so the connect path and
   * the claimability predicate can check `active`, not just existence. Returns
   * null when the code is unknown.
   */
  async getByReferralCodeDoc(
    codeLower: string,
  ): Promise<{ trainerId: string; active: boolean } | null> {
    const snap = await this.referralCodesCol.doc(codeLower).get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    const trainerId = data.trainerId;
    if (typeof trainerId !== 'string') return null;
    // Legacy/migrated docs may predate the `active` flag; treat a missing flag
    // as active so grandfathered codes keep working.
    const active = data.active === undefined ? true : data.active === true;
    return { trainerId, active };
  }

  /**
   * Transactional claim of referralCodes/{codeLower} for `trainerId`, enforcing
   * the SHARED claimability predicate: claimable iff the doc does not exist OR
   * is already owned by `trainerId` (active or inactive); unavailable iff it
   * exists owned by a DIFFERENT trainer, regardless of its `active` flag.
   *
   * All reads for the enclosing transaction must already be done by the caller;
   * this performs only the decision + write. Returns true when claimed, false
   * when the code is taken by another trainer (no write performed).
   *
   * `existing` is the pre-read referralCodes/{codeLower} doc data (or null).
   */
  claimReferralCode(
    tx: FirebaseFirestore.Transaction,
    codeLower: string,
    displayCode: string,
    trainerId: string,
    existing: { trainerId: string; active?: boolean } | null,
  ): boolean {
    if (existing && existing.trainerId !== trainerId) {
      return false; // taken by another trainer — abort with no write
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = this.referralCodesCol.doc(codeLower);
    tx.set(
      ref,
      {
        trainerId,
        code: displayCode,
        active: true,
        ...(existing ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    );
    return true;
  }

  /** Deactivates (does NOT delete) an old referralCodes/{codeLower} index doc. */
  deactivateReferralCode(tx: FirebaseFirestore.Transaction, codeLower: string): void {
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      this.referralCodesCol.doc(codeLower),
      { active: false, updatedAt: now },
      { merge: true },
    );
  }

  /** Updates the trainer record's active referral code fields inside a tx. */
  setActiveReferralCodeOnTrainer(
    tx: FirebaseFirestore.Transaction,
    trainerId: string,
    displayCode: string,
    codeLower: string,
  ): void {
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      this.trainersCol.doc(trainerId),
      {
        referralCode: displayCode,
        referralCodeLower: codeLower,
        referralCodeUpdatedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
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
