"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConversationRepository = exports.AiConversationRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Persists AI chat threads at
 * users/{uid}/aiConversations/{conversationId}/messages/{messageId}.
 */
class AiConversationRepository {
    conversations(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('aiConversations');
    }
    async ensureConversation(uid, conversationId) {
        if (conversationId)
            return conversationId;
        const ref = this.conversations(uid).doc();
        await ref.set({ createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(), updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() });
        return ref.id;
    }
    async addMessage(uid, conversationId, role, text) {
        const convRef = this.conversations(uid).doc(conversationId);
        await convRef.collection('messages').add({
            role,
            text,
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
        await convRef.set({ updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    async recentMessages(uid, conversationId, limit = 10) {
        const snap = await this.conversations(uid)
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .limitToLast(limit)
            .get();
        return snap.docs.map((d) => {
            const m = d.data();
            return { role: m.role ?? 'user', text: m.text ?? '' };
        });
    }
    /**
     * Lists the user's conversations, newest-updated first, with a lightweight
     * summary (title derived from the first user message, last-updated time and
     * message count). Owner-scoped: only reads under users/{uid}/aiConversations.
     */
    async listConversations(uid, limit = 50) {
        const snap = await this.conversations(uid).orderBy('updatedAt', 'desc').limit(limit).get();
        const out = [];
        for (const doc of snap.docs) {
            const data = doc.data();
            // First user message → conversation title (fallback to a generic label).
            const firstSnap = await doc.ref
                .collection('messages')
                .where('role', '==', 'user')
                .orderBy('createdAt', 'asc')
                .limit(1)
                .get();
            const first = firstSnap.docs[0]?.data();
            const countSnap = await doc.ref.collection('messages').count().get();
            out.push({
                id: doc.id,
                title: titleFrom(first?.text ?? ''),
                createdAt: toIso(data.createdAt),
                updatedAt: toIso(data.updatedAt),
                messageCount: countSnap.data().count ?? 0,
            });
        }
        return out;
    }
    /** Returns all messages in a conversation, oldest-first. Owner-scoped. */
    async getMessages(uid, conversationId) {
        const snap = await this.conversations(uid)
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .get();
        return snap.docs.map((d) => {
            const m = d.data();
            return {
                role: m.role ?? 'user',
                text: m.text ?? '',
                createdAt: toIso(m.createdAt),
            };
        });
    }
    /**
     * Deletes AI conversations (and their messages subcollection) for ONE user
     * whose `updatedAt` is strictly older than [cutoff]. Returns the number of
     * conversations deleted. Scoped exclusively to users/{uid}/aiConversations —
     * never touches profile, workouts, nutrition, progress, measurements, etc.
     */
    async deleteConversationsOlderThan(uid, cutoff) {
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
    async forEachUserWithConversations(fn) {
        // aiConversations is a subcollection named consistently across users; a
        // collectionGroup lets us find the owning user docs without listing every
        // user. We map each conversation's parent-of-parent (the user doc id).
        const seen = new Set();
        const group = await (0, firebase_js_1.getFirestore)().collectionGroup('aiConversations').get();
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
exports.AiConversationRepository = AiConversationRepository;
/** Builds a short conversation title from the first user message. */
function titleFrom(text) {
    const t = text.trim().replace(/\s+/g, ' ');
    if (!t)
        return 'New conversation';
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}
/** Converts a Firestore Timestamp (or ISO string) to an ISO string, or null. */
function toIso(value) {
    if (!value)
        return null;
    if (value instanceof firebase_js_1.admin.firestore.Timestamp)
        return value.toDate().toISOString();
    if (typeof value === 'string')
        return value;
    if (value instanceof Date)
        return value.toISOString();
    return null;
}
/** Deletes all documents in a (small) subcollection in batches. */
async function deleteSubcollection(ref) {
    const snap = await ref.get();
    if (snap.empty)
        return;
    const db = (0, firebase_js_1.getFirestore)();
    // Firestore batches cap at 500 ops.
    for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = db.batch();
        for (const d of snap.docs.slice(i, i + 450))
            batch.delete(d.ref);
        await batch.commit();
    }
}
exports.aiConversationRepository = new AiConversationRepository();
//# sourceMappingURL=aiConversationRepository.js.map