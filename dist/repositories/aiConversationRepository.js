"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConversationRepository = exports.AiConversationRepository = void 0;
exports.titleFromFirstMessage = titleFromFirstMessage;
exports.mapConversationSummary = mapConversationSummary;
exports.mapMessage = mapMessage;
exports.toIso = toIso;
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
            const first = firstSnap.docs[0]?.data();
            const countSnap = await doc.ref.collection('messages').count().get();
            out.push(mapConversationSummary(doc.id, data, first, countSnap.data().count ?? 0));
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
        return snap.docs.map((d) => mapMessage(d.data()));
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
/**
 * Derives the title from the conversation's first message. Only a 'user' turn
 * produces a message-based title; any other role (or a missing/malformed first
 * doc) falls back to the generic label. Pure — no Firestore access.
 */
function titleFromFirstMessage(first) {
    const role = typeof first?.role === 'string' ? first.role : undefined;
    const text = typeof first?.text === 'string' ? first.text : '';
    if (role === 'user' && text.trim())
        return titleFrom(text);
    return titleFrom('');
}
/**
 * Pure mapper: conversation doc data + its first message + message count → the
 * summary DTO. Null/missing fields default safely and timestamps serialize via
 * [toIso], so one malformed doc can never throw. Exposed for unit testing.
 */
function mapConversationSummary(id, data, first, messageCount) {
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
function mapMessage(m) {
    const data = m ?? {};
    return {
        role: typeof data.role === 'string' ? data.role : 'user',
        text: typeof data.text === 'string' ? data.text : '',
        createdAt: toIso(data.createdAt),
    };
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