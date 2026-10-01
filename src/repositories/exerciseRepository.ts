import { getFirestore } from '../config/firebase.js';
import type { Exercise } from '../models/domain.js';

/**
 * Data access for the global `exercises` collection. Reads come from Firestore
 * when configured; the service layer falls back to the bundled seed when
 * Firebase is unavailable so the library is usable offline / pre-configuration.
 */
export class ExerciseRepository {
  private get col(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('exercises');
  }

  async getAll(): Promise<Exercise[]> {
    const snap = await this.col.get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exercise, 'id'>) }));
  }

  async getById(id: string): Promise<Exercise | null> {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as Omit<Exercise, 'id'>) };
  }

  /** Bulk upsert used by the seed script. */
  async upsertMany(exercises: Exercise[]): Promise<number> {
    const db = getFirestore();
    const batchSize = 400;
    let written = 0;
    for (let i = 0; i < exercises.length; i += batchSize) {
      const batch = db.batch();
      for (const e of exercises.slice(i, i + batchSize)) {
        batch.set(this.col.doc(e.id), e, { merge: true });
      }
      await batch.commit();
      written += Math.min(batchSize, exercises.length - i);
    }
    return written;
  }
}

export const exerciseRepository = new ExerciseRepository();
