import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for dietPlans/{studentUid}: the single trainer-assigned diet plan
 * for a student (one plan per student, replaced on each assignment). Keyed by
 * the student's uid so a student's plan is reachable by exactly one document.
 *
 * Backend-Admin-SDK-only and never client-readable/writable (firestore.rules
 * denies all client access — mirrors the trainerLinks guard).
 */
export class DietPlanRepository {
  private get col(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('dietPlans');
  }

  /** Returns dietPlans/{studentUid} or null. */
  async get(studentUid: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col.doc(studentUid).get();
    if (!snap.exists) return null;
    return { studentUid: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /**
   * Upserts dietPlans/{studentUid} (merge). The caller is responsible for
   * supplying the full logical plan — a diet plan is replaced in whole on each
   * assignment, so prior fields the caller omits (e.g. a removed image) must be
   * explicitly cleared by the caller.
   */
  async upsert(
    studentUid: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ref = this.col.doc(studentUid);
    await ref.set(
      { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    const snap = await ref.get();
    return { studentUid: snap.id, ...(snap.data() as Record<string, unknown>) };
  }
}

export const dietPlanRepository = new DietPlanRepository();
