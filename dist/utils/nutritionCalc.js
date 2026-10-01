"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumTotals = sumTotals;
exports.roundTotals = roundTotals;
exports.groupByMeal = groupByMeal;
const ZERO = {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0,
};
/** Sums totals across entries. Each entry's macros already reflect its quantity. */
function sumTotals(entries) {
    return entries.reduce((acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
        carbs: acc.carbs + (e.carbs || 0),
        fat: acc.fat + (e.fat || 0),
        fiber: acc.fiber + (e.fiber || 0),
        sugar: acc.sugar + (e.sugar || 0),
        sodium: acc.sodium + (e.sodium || 0),
    }), { ...ZERO });
}
/** Rounds all totals to one decimal for display consistency. */
function roundTotals(t) {
    const r = (n) => Math.round(n * 10) / 10;
    return {
        calories: Math.round(t.calories),
        protein: r(t.protein),
        carbs: r(t.carbs),
        fat: r(t.fat),
        fiber: r(t.fiber),
        sugar: r(t.sugar),
        sodium: Math.round(t.sodium),
    };
}
/** Groups entries by meal type and computes per-meal + overall totals. */
function groupByMeal(entries) {
    const meals = {};
    for (const e of entries) {
        meals[e.mealType] ??= { entries: [], totals: { ...ZERO } };
        meals[e.mealType].entries.push(e);
    }
    for (const key of Object.keys(meals)) {
        meals[key].totals = roundTotals(sumTotals(meals[key].entries));
    }
    return { meals, totals: roundTotals(sumTotals(entries)) };
}
//# sourceMappingURL=nutritionCalc.js.map