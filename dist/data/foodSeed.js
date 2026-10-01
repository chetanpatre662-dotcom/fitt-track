"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOOD_COUNT = exports.FOODS = void 0;
function f(item) {
    return item;
}
exports.FOODS = [
    f({ id: 'chicken-breast-100g', name: 'Chicken breast (cooked)', servingSize: '100 g', servingGrams: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, sodium: 74, keywords: ['chicken', 'breast', 'poultry', 'protein'] }),
    f({ id: 'egg-large', name: 'Egg (large)', servingSize: '1 large (50 g)', servingGrams: 50, calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fiber: 0, sugar: 0.2, sodium: 71, keywords: ['egg', 'eggs', 'protein', 'breakfast'] }),
    f({ id: 'egg-white', name: 'Egg white', servingSize: '1 white (33 g)', servingGrams: 33, calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, fiber: 0, sugar: 0.2, sodium: 55, keywords: ['egg white', 'protein'] }),
    f({ id: 'oats-40g', name: 'Rolled oats (dry)', servingSize: '40 g', servingGrams: 40, calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4, sugar: 0.4, sodium: 2, keywords: ['oats', 'oatmeal', 'porridge', 'carbs', 'breakfast'] }),
    f({ id: 'white-rice-cooked-100g', name: 'White rice (cooked)', servingSize: '100 g', servingGrams: 100, calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0.1, sodium: 1, keywords: ['rice', 'white rice', 'carbs'] }),
    f({ id: 'brown-rice-cooked-100g', name: 'Brown rice (cooked)', servingSize: '100 g', servingGrams: 100, calories: 123, protein: 2.7, carbs: 26, fat: 1, fiber: 1.6, sugar: 0.4, sodium: 4, keywords: ['rice', 'brown rice', 'carbs', 'wholegrain'] }),
    f({ id: 'banana-medium', name: 'Banana (medium)', servingSize: '1 medium (118 g)', servingGrams: 118, calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugar: 14, sodium: 1, keywords: ['banana', 'fruit', 'carbs'] }),
    f({ id: 'apple-medium', name: 'Apple (medium)', servingSize: '1 medium (182 g)', servingGrams: 182, calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, sugar: 19, sodium: 2, keywords: ['apple', 'fruit'] }),
    f({ id: 'whole-milk-250ml', name: 'Whole milk', servingSize: '250 ml', servingGrams: 250, calories: 150, protein: 8, carbs: 12, fat: 8, fiber: 0, sugar: 12, sodium: 105, keywords: ['milk', 'dairy'] }),
    f({ id: 'greek-yogurt-170g', name: 'Greek yogurt (plain, nonfat)', servingSize: '170 g', servingGrams: 170, calories: 100, protein: 17, carbs: 6, fat: 0.7, fiber: 0, sugar: 6, sodium: 61, keywords: ['yogurt', 'greek', 'dairy', 'protein'] }),
    f({ id: 'whey-protein-scoop', name: 'Whey protein (1 scoop)', servingSize: '1 scoop (30 g)', servingGrams: 30, calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0.5, sugar: 2, sodium: 50, keywords: ['whey', 'protein', 'shake', 'supplement'] }),
    f({ id: 'salmon-100g', name: 'Salmon (cooked)', servingSize: '100 g', servingGrams: 100, calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, sugar: 0, sodium: 59, keywords: ['salmon', 'fish', 'protein', 'omega-3'] }),
    f({ id: 'tuna-canned-100g', name: 'Tuna (canned in water)', servingSize: '100 g', servingGrams: 100, calories: 116, protein: 26, carbs: 0, fat: 1, fiber: 0, sugar: 0, sodium: 247, keywords: ['tuna', 'fish', 'protein'] }),
    f({ id: 'beef-mince-lean-100g', name: 'Lean beef mince (cooked)', servingSize: '100 g', servingGrams: 100, calories: 217, protein: 26, carbs: 0, fat: 12, fiber: 0, sugar: 0, sodium: 72, keywords: ['beef', 'mince', 'ground beef', 'protein'] }),
    f({ id: 'sweet-potato-100g', name: 'Sweet potato (cooked)', servingSize: '100 g', servingGrams: 100, calories: 90, protein: 2, carbs: 21, fat: 0.1, fiber: 3.3, sugar: 6.5, sodium: 36, keywords: ['sweet potato', 'carbs', 'vegetable'] }),
    f({ id: 'potato-100g', name: 'Potato (boiled)', servingSize: '100 g', servingGrams: 100, calories: 87, protein: 1.9, carbs: 20, fat: 0.1, fiber: 1.8, sugar: 0.9, sodium: 4, keywords: ['potato', 'carbs', 'vegetable'] }),
    f({ id: 'broccoli-100g', name: 'Broccoli (cooked)', servingSize: '100 g', servingGrams: 100, calories: 35, protein: 2.4, carbs: 7, fat: 0.4, fiber: 3.3, sugar: 1.4, sodium: 41, keywords: ['broccoli', 'vegetable', 'greens'] }),
    f({ id: 'mixed-nuts-30g', name: 'Mixed nuts', servingSize: '30 g', servingGrams: 30, calories: 173, protein: 5, carbs: 6, fat: 15, fiber: 2.4, sugar: 1.3, sodium: 1, keywords: ['nuts', 'almonds', 'fat', 'snack'] }),
    f({ id: 'peanut-butter-tbsp', name: 'Peanut butter', servingSize: '1 tbsp (16 g)', servingGrams: 16, calories: 94, protein: 4, carbs: 3, fat: 8, fiber: 1, sugar: 1.5, sodium: 74, keywords: ['peanut butter', 'fat', 'protein', 'spread'] }),
    f({ id: 'olive-oil-tbsp', name: 'Olive oil', servingSize: '1 tbsp (14 g)', servingGrams: 14, calories: 119, protein: 0, carbs: 0, fat: 14, fiber: 0, sugar: 0, sodium: 0, keywords: ['olive oil', 'oil', 'fat'] }),
    f({ id: 'whole-wheat-bread-slice', name: 'Whole wheat bread', servingSize: '1 slice (32 g)', servingGrams: 32, calories: 82, protein: 4, carbs: 14, fat: 1.1, fiber: 2, sugar: 1.4, sodium: 144, keywords: ['bread', 'toast', 'carbs', 'wholegrain'] }),
    f({ id: 'pasta-cooked-100g', name: 'Pasta (cooked)', servingSize: '100 g', servingGrams: 100, calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, sugar: 0.6, sodium: 1, keywords: ['pasta', 'carbs'] }),
    f({ id: 'cottage-cheese-100g', name: 'Cottage cheese (low-fat)', servingSize: '100 g', servingGrams: 100, calories: 72, protein: 12, carbs: 3, fat: 1, fiber: 0, sugar: 3, sodium: 330, keywords: ['cottage cheese', 'dairy', 'protein'] }),
    f({ id: 'avocado-half', name: 'Avocado (half)', servingSize: '1/2 (100 g)', servingGrams: 100, calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7, sugar: 0.7, sodium: 7, keywords: ['avocado', 'fat', 'fruit'] }),
    f({ id: 'lentils-cooked-100g', name: 'Lentils (cooked)', servingSize: '100 g', servingGrams: 100, calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 8, sugar: 1.8, sodium: 2, keywords: ['lentils', 'legumes', 'protein', 'fiber', 'vegetarian'] }),
    f({ id: 'tofu-100g', name: 'Tofu (firm)', servingSize: '100 g', servingGrams: 100, calories: 144, protein: 15, carbs: 3, fat: 9, fiber: 2, sugar: 0.6, sodium: 14, keywords: ['tofu', 'soy', 'protein', 'vegetarian', 'vegan'] }),
];
exports.FOOD_COUNT = exports.FOODS.length;
//# sourceMappingURL=foodSeed.js.map