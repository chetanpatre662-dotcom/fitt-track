import { getFirestore, admin } from '../config/firebase.js';
import type { PrType } from '../models/domain.js';

export interface PersonalRecord {
  id?: string;
  exerciseId: string;
  exerciseName?: string;
  recordType: PrType;
  value: number;
  reps?: number | null;
  weightKg?: number | null;
  workoutId?: string;
  achievedAt?: FirebaseFirestore.Timestamp | admin.firestore.FieldValue;
}

/**
 * Data access for users/{uid}/personalRecords/{recordId}.
 * One document per (exerciseId, recordType) holding the current best.
 */
export class PersonalRecordRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('personalRecords');
  }

  private docId(exerciseId: string, recordType: PrType): string {
    return `${exerciseId}__${recordType}`;
  }

  async getBest(uid: string, exerciseId: string, recordType: PrType): Promise<PersonalRecord | null> {
    const snap = await this.col(uid).doc(this.docId(exerciseId, recordType)).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as PersonalRecord) };
  }

  async upsertBest(uid: string, record: PersonalRecord): Promise<void> {
    const id = this.docId(record.exerciseId, record.recordType);
    await this.col(uid).doc(id).set(
      { ...record, achievedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  async listForExercise(uid: string, exerciseId: string): Promise<PersonalRecord[]> {
    const snap = await this.col(uid).where('exerciseId', '==', exerciseId).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PersonalRecord) }));
  }

  async listAll(uid: string): Promise<PersonalRecord[]> {
    const snap = await this.col(uid).orderBy('achievedAt', 'desc').get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PersonalRecord) }));
  }
}

export const personalRecordRepository = new PersonalRecordRepository();
