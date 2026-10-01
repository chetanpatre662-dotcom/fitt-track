import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for:
 *  - users/{uid}/routines/{id}
 *  - users/{uid}/routineCompletions/{dateKey__routineId}
 */
export class RoutineRepository {
  private routines(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('routines');
  }

  private completions(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('routineCompletions');
  }

  newId(uid: string): string {
    return this.routines(uid).doc().id;
  }

  async get(uid: string, id: string): Promise<Record<string, unknown> | null> {
    const snap = await this.routines(uid).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async list(uid: string): Promise<Record<string, unknown>[]> {
    const snap = await this.routines(uid).get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    // Sort by time (HH:mm) ascending in-memory.
    rows.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
    return rows;
  }

  async set(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.routines(uid).doc(id);
    await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async delete(uid: string, id: string): Promise<void> {
    await this.routines(uid).doc(id).delete();
  }

  // --- Completions ---

  private completionId(dateKey: string, routineId: string): string {
    return `${dateKey}__${routineId}`;
  }

  async setCompletion(
    uid: string,
    dateKey: string,
    routineId: string,
    status: string,
  ): Promise<Record<string, unknown>> {
    const id = this.completionId(dateKey, routineId);
    const ref = this.completions(uid).doc(id);
    await ref.set(
      { dateKey, routineId, status, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async listCompletionsByDate(uid: string, dateKey: string): Promise<Record<string, unknown>[]> {
    const snap = await this.completions(uid).where('dateKey', '==', dateKey).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  }

  /** Removes all completion docs for a routine (used when the routine is deleted). */
  async deleteCompletionsForRoutine(uid: string, routineId: string): Promise<void> {
    const snap = await this.completions(uid).where('routineId', '==', routineId).get();
    if (snap.empty) return;
    const batch = getFirestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export const routineRepository = new RoutineRepository();
