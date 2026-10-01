import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for nutrition:
 *  - users/{uid}/foodLogs/{id}       logged entries (per day, per meal)
 *  - users/{uid}/customFoods/{id}    saved custom foods / favorites
 */
export class NutritionRepository {
  private logs(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('foodLogs');
  }

  private customFoods(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('customFoods');
  }

  newLogId(uid: string): string {
    return this.logs(uid).doc().id;
  }

  async getLog(uid: string, id: string): Promise<Record<string, unknown> | null> {
    const snap = await this.logs(uid).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async listByDate(uid: string, dateKey: string): Promise<Record<string, unknown>[]> {
    const snap = await this.logs(uid).where('dateKey', '==', dateKey).get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    // Sort by createdAt ascending in-memory (avoids a composite index).
    rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
    return rows;
  }

  async setLog(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.logs(uid).doc(id);
    await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async deleteLog(uid: string, id: string): Promise<void> {
    await this.logs(uid).doc(id).delete();
  }

  // --- Custom foods / favorites ---

  newCustomFoodId(uid: string): string {
    return this.customFoods(uid).doc().id;
  }

  async setCustomFood(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.customFoods(uid).doc(id);
    await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async listCustomFoods(uid: string): Promise<Record<string, unknown>[]> {
    const snap = await this.customFoods(uid).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  }

  async deleteCustomFood(uid: string, id: string): Promise<void> {
    await this.customFoods(uid).doc(id).delete();
  }
}

function tsMillis(value: unknown): number {
  const t = value as admin.firestore.Timestamp | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}

export const nutritionRepository = new NutritionRepository();
