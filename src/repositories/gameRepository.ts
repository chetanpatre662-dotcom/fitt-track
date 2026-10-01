import { getFirestore, admin } from '../config/firebase.js';

/** Data access for users/{uid}/gameHistory/{id}. */
export class GameRepository {
  private col(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('gameHistory');
  }

  async add(uid: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ref = this.col(uid).doc();
    await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    const snap = await ref.get();
    return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
  }

  async listRecent(uid: string, limit = 60): Promise<Record<string, unknown>[]> {
    const snap = await this.col(uid).orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  }
}

export const gameRepository = new GameRepository();
