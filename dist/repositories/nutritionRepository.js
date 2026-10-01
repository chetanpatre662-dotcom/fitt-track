"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nutritionRepository = exports.NutritionRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for nutrition:
 *  - users/{uid}/foodLogs/{id}       logged entries (per day, per meal)
 *  - users/{uid}/customFoods/{id}    saved custom foods / favorites
 */
class NutritionRepository {
    logs(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('foodLogs');
    }
    customFoods(uid) {
        return (0, firebase_js_1.getFirestore)().collection('users').doc(uid).collection('customFoods');
    }
    newLogId(uid) {
        return this.logs(uid).doc().id;
    }
    async getLog(uid, id) {
        const snap = await this.logs(uid).doc(id).get();
        if (!snap.exists)
            return null;
        return { id: snap.id, ...snap.data() };
    }
    async listByDate(uid, dateKey) {
        const snap = await this.logs(uid).where('dateKey', '==', dateKey).get();
        const rows = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        // Sort by createdAt ascending in-memory (avoids a composite index).
        rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
        return rows;
    }
    async setLog(uid, id, data) {
        const ref = this.logs(uid).doc(id);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async deleteLog(uid, id) {
        await this.logs(uid).doc(id).delete();
    }
    // --- Custom foods / favorites ---
    newCustomFoodId(uid) {
        return this.customFoods(uid).doc().id;
    }
    async setCustomFood(uid, id, data) {
        const ref = this.customFoods(uid).doc(id);
        await ref.set({ ...data, updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    async listCustomFoods(uid) {
        const snap = await this.customFoods(uid).get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    async deleteCustomFood(uid, id) {
        await this.customFoods(uid).doc(id).delete();
    }
}
exports.NutritionRepository = NutritionRepository;
function tsMillis(value) {
    const t = value;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
exports.nutritionRepository = new NutritionRepository();
//# sourceMappingURL=nutritionRepository.js.map