import { getFirestore, admin } from '../config/firebase.js';

/**
 * The SINGLE source of truth for a user's structured workout plan for a given
 * day: users/{uid}/dailyPlans/{dateKey}.
 *
 * Both the Plans screen and the AI Chat read/write this one document, so they
 * can never disagree about "today's workout".
 */
export class DailyPlanRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('dailyPlans');
  }

  async get(uid: string, dateKey: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col(uid).doc(dateKey).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /** Creates or replaces the plan for a date, stamping created/updated times. */
  async set(uid: string, dateKey: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.col(uid).doc(dateKey);
    const existing = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        ...data,
        dateKey,
        ...(existing.exists ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true },
    );
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }
}

export const dailyPlanRepository = new DailyPlanRepository();
