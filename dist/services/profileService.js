"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileService = exports.ProfileService = void 0;
const firebase_js_1 = require("../config/firebase.js");
const profileRepository_js_1 = require("../repositories/profileRepository.js");
const userRepository_js_1 = require("../repositories/userRepository.js");
const errors_js_1 = require("../utils/errors.js");
const fitnessCalc_js_1 = require("../utils/fitnessCalc.js");
class ProfileService {
    async get(uid) {
        const profile = await profileRepository_js_1.profileRepository.get(uid);
        if (!profile)
            throw new errors_js_1.NotFoundError('Profile not found. Complete onboarding first.');
        return profile;
    }
    /**
     * Upserts a profile. If the client did not provide custom targets, the
     * backend computes estimates from the profile + primary goal. Also flips the
     * account's onboardingCompleted flag to true.
     */
    async upsert(uid, input) {
        const age = (0, fitnessCalc_js_1.ageFromDob)(input.dateOfBirth);
        const primaryGoal = input.goals[0];
        const targets = input.targets && input.targets.isCustom
            ? input.targets
            : (0, fitnessCalc_js_1.estimateTargets)({
                weightKg: input.weightKg,
                heightCm: input.heightCm,
                ageYears: age,
                gender: input.gender,
                activity: input.activityLevel,
                goal: primaryGoal,
            });
        const data = {
            ...input,
            // Persist DOB as a Firestore Timestamp for consistent querying.
            dateOfBirth: firebase_js_1.admin.firestore.Timestamp.fromDate(new Date(input.dateOfBirth)),
            ageYears: age,
            targets,
        };
        const saved = await profileRepository_js_1.profileRepository.upsert(uid, data);
        // Mark onboarding complete + mirror units on the account doc.
        await userRepository_js_1.userRepository.doc(uid).set({
            onboardingCompleted: true,
            units: input.units,
            displayName: input.name,
            updatedAt: firebase_js_1.admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return saved;
    }
}
exports.ProfileService = ProfileService;
exports.profileService = new ProfileService();
//# sourceMappingURL=profileService.js.map