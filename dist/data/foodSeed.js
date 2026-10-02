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
    // --- Indian & commonly-used foods ---
    // Per-serving values follow the existing convention (one serving as described
    // by servingSize). Keywords include common Indian aliases/spellings so search
    // matches e.g. "roti"/"chapati", "dahi"/"curd", "chole"/"chana".
    f({ id: 'samosa-1', name: 'Samosa', servingSize: '1 piece (60 g)', servingGrams: 60, calories: 160, protein: 3.5, carbs: 18, fat: 8.5, fiber: 1.6, sugar: 1, sodium: 220, keywords: ['samosa', 'snack', 'fried', 'indian'] }),
    f({ id: 'paneer-100g', name: 'Paneer', servingSize: '100 g', servingGrams: 100, calories: 265, protein: 18, carbs: 3.4, fat: 20, fiber: 0, sugar: 2.6, sodium: 22, keywords: ['paneer', 'cottage cheese', 'cheese', 'dairy', 'protein', 'vegetarian', 'indian'] }),
    f({ id: 'roti-1', name: 'Roti / Chapati', servingSize: '1 medium (40 g)', servingGrams: 40, calories: 104, protein: 3, carbs: 20, fat: 1.5, fiber: 2.5, sugar: 0.5, sodium: 95, keywords: ['roti', 'chapati', 'chapathi', 'phulka', 'wheat', 'flatbread', 'indian'] }),
    f({ id: 'paratha-1', name: 'Paratha (plain)', servingSize: '1 piece (60 g)', servingGrams: 60, calories: 180, protein: 4, carbs: 25, fat: 7, fiber: 2.5, sugar: 0.6, sodium: 180, keywords: ['paratha', 'parantha', 'flatbread', 'indian'] }),
    f({ id: 'dal-cooked-100g', name: 'Dal (cooked)', servingSize: '100 g (1 small bowl)', servingGrams: 100, calories: 116, protein: 7, carbs: 18, fat: 1.5, fiber: 4, sugar: 1.5, sodium: 240, keywords: ['dal', 'daal', 'dhal', 'lentils', 'tadka', 'protein', 'vegetarian', 'indian'] }),
    f({ id: 'rajma-cooked-100g', name: 'Rajma (cooked)', servingSize: '100 g', servingGrams: 100, calories: 127, protein: 8.7, carbs: 22, fat: 0.5, fiber: 6.4, sugar: 0.3, sodium: 240, keywords: ['rajma', 'kidney beans', 'beans', 'protein', 'vegetarian', 'indian'] }),
    f({ id: 'chole-cooked-100g', name: 'Chole / Chana (cooked)', servingSize: '100 g', servingGrams: 100, calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, sugar: 4.8, sodium: 240, keywords: ['chole', 'chana', 'chickpeas', 'garbanzo', 'protein', 'vegetarian', 'indian'] }),
    f({ id: 'poha-100g', name: 'Poha (cooked)', servingSize: '100 g (1 bowl)', servingGrams: 100, calories: 130, protein: 2.6, carbs: 27, fat: 1.5, fiber: 1.2, sugar: 1, sodium: 180, keywords: ['poha', 'flattened rice', 'breakfast', 'indian'] }),
    f({ id: 'upma-100g', name: 'Upma (cooked)', servingSize: '100 g (1 bowl)', servingGrams: 100, calories: 150, protein: 3.5, carbs: 24, fat: 4.5, fiber: 1.5, sugar: 1, sodium: 220, keywords: ['upma', 'uppma', 'semolina', 'rava', 'breakfast', 'indian'] }),
    f({ id: 'idli-1', name: 'Idli', servingSize: '1 piece (40 g)', servingGrams: 40, calories: 58, protein: 1.6, carbs: 12, fat: 0.4, fiber: 0.6, sugar: 0.2, sodium: 110, keywords: ['idli', 'idly', 'steamed', 'breakfast', 'south indian', 'indian'] }),
    f({ id: 'dosa-1', name: 'Dosa (plain)', servingSize: '1 piece (80 g)', servingGrams: 80, calories: 133, protein: 2.7, carbs: 20, fat: 4.5, fiber: 1, sugar: 0.5, sodium: 200, keywords: ['dosa', 'dosai', 'south indian', 'breakfast', 'indian'] }),
    f({ id: 'curd-100g', name: 'Curd / Dahi (plain)', servingSize: '100 g', servingGrams: 100, calories: 60, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0, sugar: 4.7, sodium: 46, keywords: ['curd', 'dahi', 'yogurt', 'dairy', 'indian'] }),
    f({ id: 'sprouts-100g', name: 'Moong sprouts', servingSize: '100 g', servingGrams: 100, calories: 30, protein: 3, carbs: 6, fat: 0.2, fiber: 1.8, sugar: 4.1, sodium: 6, keywords: ['sprouts', 'moong', 'mung', 'beans', 'salad', 'vegetarian', 'indian'] }),
    f({ id: 'chicken-curry-100g', name: 'Chicken curry', servingSize: '100 g', servingGrams: 100, calories: 180, protein: 15, carbs: 4, fat: 11, fiber: 1, sugar: 2, sodium: 350, keywords: ['chicken curry', 'chicken', 'curry', 'indian', 'protein'] }),
    f({ id: 'orange-medium', name: 'Orange (medium)', servingSize: '1 medium (131 g)', servingGrams: 131, calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3.1, sugar: 12, sodium: 0, keywords: ['orange', 'fruit', 'citrus'] }),
];
exports.FOOD_COUNT = exports.FOODS.length;
//# sourceMappingURL=foodSeed.js.map