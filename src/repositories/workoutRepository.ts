import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for users/{uid}/workouts/{workoutId}.
 *
 * Design note: a workout's exercises and sets are bounded in size and are
 * always read/written together, so they are stored as an embedded array on the
 * workout document rather than as subcollections. This makes reads a single
 * document fetch, updates atomic, and avoids many small Firestore operations —
 * a better engineering trade-off for workout-sized data than the subcollection
 * layout, while the documented subcollection paths remain reserved for future
 * per-set querying if ever needed.
 */
export class WorkoutRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('workouts');
  }

  newId(uid: string): string {
    return this.col(uid).doc().id;
  }

  async get(uid: string, id: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col(uid).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async list(
    uid: string,
    opts: { status?: string; isTemplate?: boolean; limit?: number },
  ): Promise<Record<string, unknown>[]> {
    let q: FirebaseFirestore.Query = this.col(uid);
    if (opts.isTemplate !== undefined) q = q.where('isTemplate', '==', opts.isTemplate);
    if (opts.status) q = q.where('status', '==', opts.status);
    // Templates ordered by update time; workouts by start/creation time.
    q = q.orderBy(opts.isTemplate ? 'updatedAt' : 'createdAt', 'desc');
    if (opts.limit) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  }

  async set(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.col(uid).doc(id);
    await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async delete(uid: string, id: string): Promise<void> {
    await this.col(uid).doc(id).delete();
  }
}

export const workoutRepository = new WorkoutRepository();
