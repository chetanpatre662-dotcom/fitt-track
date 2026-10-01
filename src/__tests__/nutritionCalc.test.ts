import { describe, it, expect } from 'vitest';
import { groupByMeal, roundTotals, sumTotals, type FoodLogEntry } from '../utils/nutritionCalc.js';

const entry = (over: Partial<FoodLogEntry>): FoodLogEntry => ({
  mealType: 'breakfast',
  name: 'x',
  quantity: 1,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  ...over,
});

describe('nutritionCalc', () => {
  it('sums totals across entries', () => {
    const totals = sumTotals([
      entry({ calories: 200, protein: 20, carbs: 10, fat: 5 }),
      entry({ calories: 300, protein: 10, carbs: 40, fat: 8 }),
    ]);
    expect(totals.calories).toBe(500);
    expect(totals.protein).toBe(30);
    expect(totals.carbs).toBe(50);
    expect(totals.fat).toBe(13);
  });

  it('empty list yields zeros', () => {
    const totals = sumTotals([]);
    expect(totals.calories).toBe(0);
    expect(totals.protein).toBe(0);
  });

  it('rounds macros to one decimal and calories/sodium to whole', () => {
    const t = roundTotals({ calories: 199.6, protein: 20.44, carbs: 10.16, fat: 5.05, fiber: 3.33, sugar: 1.11, sodium: 120.7 });
    expect(t.calories).toBe(200);
    expect(t.protein).toBe(20.4);
    expect(t.carbs).toBe(10.2);
    expect(t.sodium).toBe(121);
  });

  it('groups by meal and computes per-meal + overall totals', () => {
    const { meals, totals } = groupByMeal([
      entry({ mealType: 'breakfast', calories: 300, protein: 20 }),
      entry({ mealType: 'breakfast', calories: 100, protein: 5 }),
      entry({ mealType: 'dinner', calories: 600, protein: 40 }),
    ]);
    expect(meals.breakfast.entries.length).toBe(2);
    expect(meals.breakfast.totals.calories).toBe(400);
    expect(meals.breakfast.totals.protein).toBe(25);
    expect(meals.dinner.totals.calories).toBe(600);
    expect(totals.calories).toBe(1000);
    expect(totals.protein).toBe(65);
  });
});
