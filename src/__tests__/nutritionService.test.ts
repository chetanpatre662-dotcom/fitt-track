import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Firebase config module with an in-memory Firestore so
// nutritionService + nutritionRepository can be exercised without real
// credentials. The store keys documents by id within a single foodLogs
// collection (the only collection these tests touch), supports .where(field,
// '==', value).get() for listByDate, and auto-generates ids via .doc().id.

const SERVER_TIMESTAMP = { __fv: 'serverTimestamp' };

/** uid -> (docId -> data). Each doc stores its own fields (no id field). */
let store: Map<string, Map<string, Record<string, unknown>>>;
let autoIdCounter: number;

function collectionFor(uid: string): Map<string, Record<string, unknown>> {
  let col = store.get(uid);
  if (!col) {
    col = new Map();
    store.set(uid, col);
  }
  return col;
}

function makeDocRef(col: Map<string, Record<string, unknown>>, id: string) {
  return {
    id,
    get: vi.fn(async () => ({
      get exists() {
        return col.has(id);
      },
      id,
      data: () => col.get(id),
    })),
    set: vi.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      const prev = options?.merge === true ? col.get(id) ?? {} : {};
      col.set(id, { ...prev, ...data });
    }),
    delete: vi.fn(async () => {
      col.delete(id);
    }),
  };
}

function makeCollectionRef(uid: string) {
  const col = collectionFor(uid);
  return {
    doc: (id?: string) => makeDocRef(col, id ?? `auto-${autoIdCounter++}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => {
        const docs = [...col.entries()]
          .filter(([, data]) => data[field] === value)
          .map(([docId, data]) => ({ id: docId, data: () => data }));
        return { docs };
      },
    }),
    get: async () => {
      const docs = [...col.entries()].map(([docId, data]) => ({ id: docId, data: () => data }));
      return { docs };
    },
  };
}

vi.mock('../config/firebase.js', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (uid: string) => ({
        collection: (_sub: string) => makeCollectionRef(uid),
      }),
    }),
  }),
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => SERVER_TIMESTAMP,
      },
    },
  },
}));

import { nutritionService } from '../services/nutritionService.js';
import type { FoodLogUpsertInput } from '../validators/nutritionValidators.js';

const UID = 'uid-1';
const DATE = '2026-01-05';

const upsert = (over: Partial<FoodLogUpsertInput>): FoodLogUpsertInput => ({
  dateKey: DATE,
  mealType: 'custom',
  name: 'x',
  servingSize: '1 serving',
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

beforeEach(() => {
  store = new Map();
  autoIdCounter = 0;
});

describe('NutritionService.getDay', () => {
  it('preserves mealId/mealName on the returned entries', async () => {
    await nutritionService.addFood(
      UID,
      upsert({ mealType: 'custom', mealId: 'meal-abc', mealName: 'Pre-Workout', name: 'Banana', calories: 100 }),
    );

    const day = await nutritionService.getDay(UID, DATE);

    expect(day.entries).toHaveLength(1);
    expect(day.entries[0].mealId).toBe('meal-abc');
    expect(day.entries[0].mealName).toBe('Pre-Workout');
    expect(day.entries[0].name).toBe('Banana');
  });

  it('defaults mealId/mealName to null when absent', async () => {
    await nutritionService.addFood(UID, upsert({ mealType: 'breakfast', name: 'Oats', calories: 150 }));

    const day = await nutritionService.getDay(UID, DATE);

    expect(day.entries[0].mealId).toBeNull();
    expect(day.entries[0].mealName).toBeNull();
  });

  it('sums daily totals including fiber/sugar/sodium', async () => {
    await nutritionService.addFood(
      UID,
      upsert({ name: 'A', calories: 200, protein: 20, carbs: 10, fat: 5, fiber: 3, sugar: 2, sodium: 100 }),
    );
    await nutritionService.addFood(
      UID,
      upsert({ name: 'B', calories: 300, protein: 10, carbs: 40, fat: 8, fiber: 4, sugar: 6, sodium: 250 }),
    );

    const day = await nutritionService.getDay(UID, DATE);

    expect(day.totals.calories).toBe(500);
    expect(day.totals.protein).toBe(30);
    expect(day.totals.carbs).toBe(50);
    expect(day.totals.fat).toBe(13);
    expect(day.totals.fiber).toBe(7);
    expect(day.totals.sugar).toBe(8);
    expect(day.totals.sodium).toBe(350);
  });
});

describe('NutritionService.addFood idempotency', () => {
  it('writes exactly one doc and no doubled totals when the same clientId is reused', async () => {
    const input = upsert({ clientId: 'tap-1', name: 'Banana', calories: 100, protein: 1 });
    await nutritionService.addFood(UID, input);
    await nutritionService.addFood(UID, input);

    const day = await nutritionService.getDay(UID, DATE);

    expect(day.entries).toHaveLength(1);
    expect(day.totals.calories).toBe(100);
    expect(day.totals.protein).toBe(1);
  });

  it('does not persist clientId in the stored document', async () => {
    await nutritionService.addFood(UID, upsert({ clientId: 'tap-2', name: 'Apple', calories: 80 }));

    const stored = store.get(UID)!.get('tap-2')!;
    expect(stored).not.toHaveProperty('clientId');
    expect(stored.name).toBe('Apple');
  });

  it('generates a unique id when no clientId is supplied (distinct docs)', async () => {
    await nutritionService.addFood(UID, upsert({ name: 'A', calories: 100 }));
    await nutritionService.addFood(UID, upsert({ name: 'B', calories: 100 }));

    const day = await nutritionService.getDay(UID, DATE);
    expect(day.entries).toHaveLength(2);
    expect(day.totals.calories).toBe(200);
  });
});
