"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignedWorkoutRepository = exports.AssignedWorkoutRepository = void 0;
const firebase_js_1 = require("../config/firebase.js");
/**
 * Data access for assignedWorkouts/{studentUid}/items/{id}: the trainer-assigned
 * workout templates for a student. Unlike dietPlans (one doc per student), a
 * student may have multiple assigned workouts, so each is its own item document
 * under the student's `items` subcollection, keyed by an auto-generated id.
 *
 * Backend-Admin-SDK-only and never client-readable/writable (firestore.rules
 * denies all client access — mirrors the trainerLinks guard).
 */
class AssignedWorkoutRepository {
    items(studentUid) {
        return (0, firebase_js_1.getFirestore)().collection('assignedWorkouts').doc(studentUid).collection('items');
    }
    /**
     * Creates a new assigned-workout item for the student. The caller supplies the
     * full logical payload (trainerId, name, scheduledDate, exercises); this stamps
     * the generated id into the stored doc and a server createdAt, then returns the
     * saved doc (with id).
     */
    async add(studentUid, data) {
        const ref = this.items(studentUid).doc();
        await ref.set({
            ...data,
            id: ref.id,
            createdAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        });
        const snap = await ref.get();
        return { id: snap.id, ...snap.data() };
    }
    /** Lists all assigned-workout items for the student (unordered; caller sorts). */
    async list(studentUid) {
        const snap = await this.items(studentUid).get();
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
}
exports.AssignedWorkoutRepository = AssignedWorkoutRepository;
exports.assignedWorkoutRepository = new AssignedWorkoutRepository();
//# sourceMappingURL=assignedWorkoutRepository.js.map