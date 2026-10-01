"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bmi = bmi;
exports.bmr = bmr;
exports.tdee = tdee;
exports.estimateTargets = estimateTargets;
exports.ageFromDob = ageFromDob;
/**
 * Fitness estimation helpers. All values are ESTIMATES for planning only —
 * not medical advice. The client clearly labels them and allows user override.
 */
/** Activity multipliers for TDEE (Total Daily Energy Expenditure). */
const ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
};
/** Body Mass Index. */
function bmi(weightKg, heightCm) {
    const m = heightCm / 100;
    if (m <= 0)
        return 0;
    return round1(weightKg / (m * m));
}
/**
 * Basal Metabolic Rate via the Mifflin-St Jeor equation (kcal/day).
 * For 'other'/'prefer_not_to_say' we average the male/female constants.
 */
function bmr(params) {
    const { weightKg, heightCm, ageYears, gender } = params;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
    const genderConstant = gender === 'male' ? 5 : gender === 'female' ? -161 : -78; // -78 ≈ average
    return Math.max(0, Math.round(base + genderConstant));
}
/** Total Daily Energy Expenditure = BMR × activity multiplier. */
function tdee(bmrValue, activity) {
    return Math.round(bmrValue * (ACTIVITY_MULTIPLIERS[activity] ?? 1.2));
}
/** Goal-based calorie adjustment (kcal delta applied to TDEE). */
function calorieDeltaForGoal(goal) {
    switch (goal) {
        case 'fat_loss':
        case 'weight_loss':
            return -400;
        case 'muscle_gain':
        case 'weight_gain':
            return 300;
        case 'strength':
            return 150;
        default:
            return 0; // maintain, general fitness, endurance, cardiovascular
    }
}
/**
 * Estimated nutrition targets from profile data and the PRIMARY goal.
 * Macro split:
 *   - Protein: 1.8 g/kg bodyweight (supports muscle gain / retention).
 *   - Fat: 25% of calories.
 *   - Carbs: remainder.
 * Water: 35 ml/kg bodyweight (planning heuristic).
 */
function estimateTargets(params) {
    const bmrValue = bmr(params);
    const maintenance = tdee(bmrValue, params.activity);
    const calories = Math.max(1200, maintenance + calorieDeltaForGoal(params.goal));
    const protein = Math.round(1.8 * params.weightKg);
    const proteinKcal = protein * 4;
    const fatKcal = Math.round(calories * 0.25);
    const fat = Math.round(fatKcal / 9);
    const carbsKcal = Math.max(0, calories - proteinKcal - fatKcal);
    const carbs = Math.round(carbsKcal / 4);
    const waterMl = Math.round(35 * params.weightKg);
    return { calories, protein, carbs, fat, waterMl, isCustom: false };
}
/** Age in whole years from an ISO date-of-birth string. */
function ageFromDob(dobIso, now = new Date()) {
    const dob = new Date(dobIso);
    if (Number.isNaN(dob.getTime()))
        return 0;
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate()))
        age -= 1;
    return Math.max(0, age);
}
function round1(n) {
    return Math.round(n * 10) / 10;
}
//# sourceMappingURL=fitnessCalc.js.map