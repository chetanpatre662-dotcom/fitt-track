import { getFirestore, admin } from '../config/firebase.js';

/**
 * Persists AI chat threads at
 * users/{uid}/aiConversations/{conversationId}/messages/{messageId}.
 */
export class AiConversationRepository {
  private conversations(uid: string): FirebaseFirestore.CollectionReference {
    return getFirestore().collection('users').doc(uid).collection('aiConversations');
  }

  async ensureConversation(uid: string, conversationId?: string): Promise<string> {
    if (conversationId) return conversationId;
    const ref = this.conversations(uid).doc();
    await ref.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }

  async addMessage(uid: string, conversationId: string, role: 'user' | 'assistant', text: string): Promise<void> {
    const convRef = this.conversations(uid).doc(conversationId);
    await convRef.collection('messages').add({
      role,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await convRef.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async recentMessages(uid: string, conversationId: string, limit = 10): Promise<Array<{ role: string; text: string }>> {
    const snap = await this.conversations(uid)
      .doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(limit)
      .get();
    return snap.docs.map((d) => {
      const m = d.data() as Record<string, unknown>;
      return { role: (m.role as string) ?? 'user', text: (m.text as string) ?? '' };
    });
  }
}

export const aiConversationRepository = new AiConversationRepository();
