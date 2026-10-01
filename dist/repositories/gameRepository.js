"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameRepository = exports.GameRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/** Data access for users/{uid}/gameHistory/{id}. */
class GameRepository {
    col(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('gameHistory');
    }
    async add(uid, data) {
        const ref = this.col(uid).doc();
        await ref.set({ ...data, createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async listRecent(uid, limit = 60) {
        const snap = await this.col(uid).orderBy('createdAt', 'desc').limit(limit).get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
}
exports.GameRepository = GameRepository;
exports.gameRepository = new GameRepository();
//# sourceMappingURL=gameRepository.js.map