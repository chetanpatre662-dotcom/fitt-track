import { getFirestore, admin } from '../config/firebase.js';

/**
 * Metadata for progress photos: users/{uid}/progressPhotos/{id}.
 *
 * The image bytes live in Firebase Storage (uploaded by the authenticated
 * client under users/{uid}/..., enforced private by Storage rules). Only the
 * storage path + descriptive metadata are stored here, matching the app's
 * existing "metadata in Firestore, binary in Storage" split.
 */
export class ProgressPhotoRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('progressPhotos');
  }

  newId(uid: string): string {
    return this.col(uid).doc().id;
  }

  async get(uid: string, id: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col(uid).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async set(uid: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.col(uid).doc(id);
    await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async list(uid: string, limit = 200): Promise<Record<string, unknown>[]> {
    const snap = await this.col(uid).get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.takenAt) - tsMillis(a.takenAt));
    return rows.slice(0, limit);
  }

  async delete(uid: string, id: string): Promise<void> {
    await this.col(uid).doc(id).delete();
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

export const progressPhotoRepository = new ProgressPhotoRepository();
