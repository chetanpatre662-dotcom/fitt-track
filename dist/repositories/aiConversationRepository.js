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
}
exports.AiConversationRepository = AiConversationRepository;
exports.aiConversationRepository = new AiConversationRepository();
//# sourceMappingURL=aiConversationRepository.js.map