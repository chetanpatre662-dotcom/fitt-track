import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for users/{uid}/bodyMeasurements/{id}.
 *
 * Each document is an immutable dated record (height/weight at a point in
 * time). Editing the profile's current height/weight APPENDS a new record here
 * rather than mutating existing ones, so history is preserved. A composite
 * index (type ASC, measuredAt DESC) is declared in firestore.indexes.json.
 */
export class MeasurementRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('bodyMeasurements');
  }

  newId(uid: string): string {
    return this.col(uid).doc().id;
  }

  /** Appends a measurement record. Never overwrites existing records. */
  async add(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.col(uid).doc(id);
    await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /** Returns all measurement records, newest first (sorted in-memory). */
  async list(uid: string, limit = 365): Promise<Record<string, unknown>[]> {
    const snap = await this.col(uid).get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.measuredAt) - tsMillis(a.measuredAt));
    return rows.slice(0, limit);
  }
}

function tsMillis(value: unknown): number {
  const t = value as admin.firestore.Timestamp | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

export const measurementRepository = new MeasurementRepository();
