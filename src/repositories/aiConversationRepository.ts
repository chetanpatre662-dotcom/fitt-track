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

  /**
   * Lists the user's conversations, newest-updated first, with a lightweight
   * summary (title derived from the first user message, last-updated time and
   * message count). Owner-scoped: only reads under users/{uid}/aiConversations.
   */
  async listConversations(
    uid: string,
    limit = 50,
  ): Promise<
    Array<{ id: string; title: string; createdAt: string | null; updatedAt: string | null; messageCount: number }>
  > {
    const snap = await this.conversations(uid).orderBy('updatedAt', 'desc').limit(limit).get();
    const out: Array<{
      id: string;
      title: string;
      createdAt: string | null;
      updatedAt: string | null;
      messageCount: number;
    }> = [];
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      // First message → conversation title. We order ONLY by createdAt (covered
      // by the existing messages (createdAt ASC) index) so this read never needs
      // a composite index. The first message of a thread is always the user turn
      // (aiController.chat persists 'user' then 'assistant'); if that first doc
      // is somehow not a user turn, titleFromFirstMessage falls back to a label.
      const firstSnap = await doc.ref
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get();
      const first = firstSnap.docs[0]?.data() as Record<string, unknown> | undefined;
      const countSnap = await doc.ref.collection('messages').count().get();
      out.push(
        mapConversationSummary(doc.id, data, first, (countSnap.data().count as number) ?? 0),
      );
    }
    return out;
  }

  /** Returns all messages in a conversation, oldest-first. Owner-scoped. */
  async getMessages(
    uid: string,
    conversationId: string,
  ): Promise<Array<{ role: string; text: string; createdAt: string | null }>> {
    const snap = await this.conversations(uid)
      .doc(conversationId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs.map((d) => mapMessage(d.data() as Record<string, unknown>));
  }

  /**
   * Deletes AI conversations (and their messages subcollection) for ONE user
   * whose `updatedAt` is strictly older than [cutoff]. Returns the number of
   * conversations deleted. Scoped exclusively to users/{uid}/aiConversations —
   * never touches profile, workouts, nutrition, progress, measurements, etc.
   */
  async deleteConversationsOlderThan(uid: string, cutoff: Date): Promise<number> {
    const snap = await this.conversations(uid).where('updatedAt', '<', cutoff).get();
    let deleted = 0;
    for (const doc of snap.docs) {
      // Delete the messages subcollection first, then the conversation doc.
      await deleteSubcollection(doc.ref.collection('messages'));
      await doc.ref.delete();
      deleted += 1;
    }
    return deleted;
  }

  /** Iterates every user that has an aiConversations collection. */
  async forEachUserWithConversations(fn: (uid: string) => Promise<void>): Promise<void> {
    // aiConversations is a subcollection named consistently across users; a
    // collectionGroup lets us find the owning user docs without listing every
    // user. We map each conversation's parent-of-parent (the user doc id).
    const seen = new Set<string>();
    const group = await getFirestore().collectionGroup('aiConversations').get();
    for (const doc of group.docs) {
      // path: users/{uid}/aiConversations/{convId}
      const uid = doc.ref.parent.parent?.id;
      if (uid && !seen.has(uid)) {
        seen.add(uid);
      }
    }
    for (const uid of seen) {
      await fn(uid);
    }
  }
}

/** Builds a short conversation title from the first user message. */
function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return 'New conversation';
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * Derives the title from the conversation's first message. Only a 'user' turn
 * produces a message-based title; any other role (or a missing/malformed first
 * doc) falls back to the generic label. Pure — no Firestore access.
 */
export function titleFromFirstMessage(first: Record<string, unknown> | undefined): string {
  const role = typeof first?.role === 'string' ? (first.role as string) : undefined;
  const text = typeof first?.text === 'string' ? (first.text as string) : '';
  if (role === 'user' && text.trim()) return titleFrom(text);
  return titleFrom('');
}

/**
 * Pure mapper: conversation doc data + its first message + message count → the
 * summary DTO. Null/missing fields default safely and timestamps serialize via
 * [toIso], so one malformed doc can never throw. Exposed for unit testing.
 */
export function mapConversationSummary(
  id: string,
  data: Record<string, unknown> | undefined,
  first: Record<string, unknown> | undefined,
  messageCount: number,
): { id: string; title: string; createdAt: string | null; updatedAt: string | null; messageCount: number } {
  const d = data ?? {};
  const count = Number.isFinite(messageCount) ? Math.max(0, Math.trunc(messageCount)) : 0;
  return {
    id,
    title: titleFromFirstMessage(first),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    messageCount: count,
  };
}

/**
 * Pure mapper: a message doc's data → the message DTO. Defaults role/text and
 * serializes createdAt defensively. Exposed for unit testing.
 */
export function mapMessage(
  m: Record<string, unknown> | undefined,
): { role: string; text: string; createdAt: string | null } {
  const data = m ?? {};
  return {
    role: typeof data.role === 'string' ? (data.role as string) : 'user',
    text: typeof data.text === 'string' ? (data.text as string) : '',
    createdAt: toIso(data.createdAt),
  };
}

/** Converts a Firestore Timestamp (or ISO string) to an ISO string, or null. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

/** Deletes all documents in a (small) subcollection in batches. */
async function deleteSubcollection(ref: FirebaseFirestore.CollectionReference): Promise<void> {
  const snap = await ref.get();
  if (snap.empty) return;
  const db = getFirestore();
  // Firestore batches cap at 500 ops.
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
}

export const aiConversationRepository = new AiConversationRepository();
