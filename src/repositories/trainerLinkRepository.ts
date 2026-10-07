import { getFirestore, admin } from '../config/firebase.js';

/**
 * Data access for trainerLinks/{studentUid}: the single source of truth for the
 * trainer <-> student relationship, keyed by the student's uid (one student
 * belongs to at most one trainer).
 *
 * Backend-Admin-SDK-write-only and never client-readable (firestore.rules).
 */
export class TrainerLinkRepository {
  private get col(): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('trainerLinks');
  }

  /** Returns trainerLinks/{studentUid} or null. */
  async get(studentUid: string): Promise<Record<string, unknown> | null> {
    const snap = await this.col.doc(studentUid).get();
    if (!snap.exists) return null;
    return { studentUid: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  /** All active links owned by a trainer, newest first. */
  async listByTrainer(trainerId: string): Promise<Record<string, unknown>[]> {
    const snap = await this.col
      .where('trainerId', '==', trainerId)
      .where('status', '==', 'active')
      .get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      studentUid: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
    return rows;
  }

  /** All PENDING requests addressed to a trainer, newest first. */
  async listRequestsByTrainer(trainerId: string): Promise<Record<string, unknown>[]> {
    const snap = await this.col
      .where('trainerId', '==', trainerId)
      .where('status', '==', 'pending')
      .get();
    const rows: Record<string, unknown>[] = snap.docs.map((d) => ({
      studentUid: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
    return rows;
  }

  /** Direct document reference (used inside transactions). */
  doc(studentUid: string): FirebaseFirestore.DocumentReference {
    return this.col.doc(studentUid);
  }

  /** Shared FieldValue helpers so callers can build transactional writes. */
  get fieldValue(): typeof admin.firestore.FieldValue {
    return admin.firestore.FieldValue;
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

export const trainerLinkRepository = new TrainerLinkRepository();
