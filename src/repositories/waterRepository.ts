import { getFirestore, admin } from '../config/firebase.js';

/** Data access for users/{uid}/waterLogs/{id}. */
export class WaterRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('waterLogs');
  }

  newId(uid: string): string {
    return this.col(uid).doc().id;
  }

  async get(uid: string, id: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col(uid).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async listByDate(uid: string, dateKey: string): Promise<Record<string, unknown>[]> {
    const snap = await this.col(uid).where('dateKey', '==', dateKey).get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
    return rows;
  }

  async add(uid: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.newId(uid);
    const ref = this.col(uid).doc(id);
    await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async delete(uid: string, id: string): Promise<void> {
    await this.col(uid).doc(id).delete();
  }
}

function tsMillis(value: unknown): number {
  const t = value as admin.firestore.Timestamp | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}

export const waterRepository = new WaterRepository();
