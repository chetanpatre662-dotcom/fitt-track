import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for assignedWorkouts/{studentUid}/items/{id}: the trainer-assigned
 * workout templates for a student. Unlike dietPlans (one doc per student), a
 * student may have multiple assigned workouts, so each is its own item document
 * under the student's `items` subcollection, keyed by an auto-generated id.
 *
 * Backend-Admin-SDK-only and never client-readable/writable (firestore.rules
 * denies all client access — mirrors the trainerLinks guard).
 */
export class AssignedWorkoutRepository {
  private items(studentUid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('assignedWorkouts').doc(studentUid).collection('items');
  }

  /**
   * Creates a new assigned-workout item for the student. The caller supplies the
   * full logical payload (trainerId, name, scheduledDate, exercises); this stamps
   * the generated id into the stored doc and a server createdAt, then returns the
   * saved doc (with id).
   */
  async add(studentUid: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.items(studentUid).doc();
    await ref.set({
      ...data,
      id: ref.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /** Lists all assigned-workout items for the student (unordered; caller sorts). */
  async list(studentUid: string): Promise<Record<string, unknown>[]> {
    const snap = await this.items(studentUid).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  }
}

export const assignedWorkoutRepository = new AssignedWorkoutRepository();
