// Mock recipe data. To add a recipe, copy one of these objects and edit it.
// - `tags` power the filter chips on the Recipes tab.
// - `ingredients` are matched against your pantry and the board by name, so keep names simple ("eggs", not "2 large eggs").
// - `staples` are basics we assume everyone has (salt, oil...), so they're never marked as missing.

export const RECIPES = [
  {
    id: "egg-fried-rice", name: "Egg Fried Rice", emoji: "🍳", minutes: 15, servings: 2,
    tags: ["Chinese", "Quick", "Budget"],
    ingredients: [
      { name: "rice", amount: "2 cups cooked" }, { name: "eggs", amount: "2" },
      { name: "soy sauce", amount: "2 tbsp" }, { name: "green onions", amount: "2 stalks" },
      { name: "frozen peas", amount: "½ cup" }, { name: "garlic", amount: "2 cloves" },
    ],
    staples: ["oil", "salt"],
    steps: [
      "Scramble the eggs in a hot oiled pan, then set aside.",
      "Fry garlic and peas for 1 minute, add the rice and stir-fry until hot.",
      "Add soy sauce and eggs back in, top with green onions.",
    ],
  },
  {
    id: "chana-masala", name: "Chana Masala", emoji: "🍛", minutes: 35, servings: 3,
    tags: ["Indian", "Spicy", "Vegan", "Budget"],
    ingredients: [
      { name: "chickpeas", amount: "1 can" }, { name: "onions", amount: "1" },
      { name: "tomatoes", amount: "2" }, { name: "garlic", amount: "3 cloves" },
      { name: "ginger", amount: "1 inch" }, { name: "garam masala", amount: "1 tbsp" },
      { name: "chili powder", amount: "1 tsp" }, { name: "rice", amount: "1 cup" },
    ],
    staples: ["oil", "salt"],
    steps: [
      "Cook diced onion until golden, then add garlic and ginger.",
      "Add chopped tomatoes and spices and cook until jammy.",
      "Stir in chickpeas with ½ cup water and simmer 15 minutes. Serve over rice.",
    ],
  },
  {
    id: "palak-paneer", name: "Palak Paneer", emoji: "🥬", minutes: 30, servings: 3,
    tags: ["Indian", "Vegetarian"],
    ingredients: [
      { name: "spinach", amount: "1 bag" }, { name: "paneer", amount: "200 g" },
      { name: "onions", amount: "1" }, { name: "garlic", amount: "3 cloves" },
      { name: "ginger", amount: "1 inch" }, { name: "cream", amount: "¼ cup" },
      { name: "garam masala", amount: "1 tsp" },
    ],
    staples: ["oil", "salt"],
    steps: [
      "Wilt the spinach in boiling water, then blend it smooth.",
      "Cook onion, garlic and ginger, then add the spinach and garam masala.",
      "Stir in cream and cubed paneer and simmer 5 minutes.",
    ],
  },
  {
    id: "mapo-tofu", name: "Mapo Tofu", emoji: "🌶️", minutes: 25, servings: 2,
    tags: ["Chinese", "Spicy"],
    ingredients: [
      { name: "tofu", amount: "1 block" }, { name: "ground pork", amount: "¼ lb" },
      { name: "chili bean paste", amount: "1 tbsp" }, { name: "garlic", amount: "2 cloves" },
      { name: "soy sauce", amount: "1 tbsp" }, { name: "green onions", amount: "2 stalks" },
      { name: "rice", amount: "1 cup" },
    ],
    staples: ["oil", "cornstarch"],
    steps: [
      "Brown the pork with garlic and chili bean paste.",
      "Add ½ cup water, soy sauce and cubed tofu, and simmer 5 minutes.",
      "Thicken with a cornstarch slurry, top with green onions, and serve with rice.",
    ],
  },
  {
    id: "quesadillas", name: "Bean & Cheese Quesadillas", emoji: "🫓", minutes: 10, servings: 2,
    tags: ["Mexican", "Vegetarian", "Quick", "Budget"],
    ingredients: [
      { name: "tortillas", amount: "4" }, { name: "black beans", amount: "1 can" },
      { name: "cheese", amount: "1 cup shredded" }, { name: "salsa", amount: "½ cup" },
    ],
    staples: ["oil"],
    steps: [
      "Fill half of each tortilla with beans and cheese, then fold.",
      "Crisp in a pan 2–3 minutes per side.",
      "Slice and serve with salsa.",
    ],
  },
  {
    id: "chicken-tacos", name: "Spicy Chicken Tacos", emoji: "🌮", minutes: 25, servings: 3,
    tags: ["Mexican", "Spicy"],
    ingredients: [
      { name: "tortillas", amount: "6" }, { name: "chicken thighs", amount: "1 lb" },
      { name: "chili powder", amount: "1 tbsp" }, { name: "onions", amount: "½" },
      { name: "lime", amount: "1" }, { name: "cilantro", amount: "a handful" },
    ],
    staples: ["oil", "salt"],
    steps: [
      "Rub the chicken with chili powder and salt, then sear until cooked through.",
      "Slice it and warm the tortillas.",
      "Top with diced onion, cilantro and a squeeze of lime.",
    ],
  },
  {
    id: "garlic-pasta", name: "Garlic Butter Pasta", emoji: "🍝", minutes: 15, servings: 2,
    tags: ["Italian", "Vegetarian", "Quick", "Budget"],
    ingredients: [
      { name: "pasta", amount: "½ box" }, { name: "butter", amount: "3 tbsp" },
      { name: "garlic", amount: "4 cloves" }, { name: "parmesan", amount: "½ cup" },
    ],
    staples: ["salt", "pepper"],
    steps: [
      "Boil the pasta, saving ½ cup of the pasta water.",
      "Melt butter with sliced garlic until fragrant.",
      "Toss in the pasta, parmesan and a splash of pasta water.",
    ],
  },
  {
    id: "shakshuka", name: "Shakshuka", emoji: "🍅", minutes: 25, servings: 2,
    tags: ["Middle Eastern", "Vegetarian", "Breakfast"],
    ingredients: [
      { name: "eggs", amount: "4" }, { name: "tomatoes", amount: "1 can" },
      { name: "onions", amount: "1" }, { name: "bell pepper", amount: "1" },
      { name: "garlic", amount: "2 cloves" }, { name: "cumin", amount: "1 tsp" },
    ],
    staples: ["oil", "salt"],
    steps: [
      "Soften onion, pepper and garlic with cumin.",
      "Add tomatoes and simmer 10 minutes.",
      "Make wells, crack in the eggs, cover and cook until set.",
    ],
  },
  {
    id: "pancakes", name: "Fluffy Pancakes", emoji: "🥞", minutes: 20, servings: 2,
    tags: ["American", "Breakfast", "Vegetarian"],
    ingredients: [
      { name: "flour", amount: "1 cup" }, { name: "milk", amount: "1 cup" },
      { name: "eggs", amount: "1" }, { name: "sugar", amount: "2 tbsp" },
      { name: "baking powder", amount: "2 tsp" }, { name: "butter", amount: "2 tbsp" },
    ],
    staples: ["salt"],
    steps: [
      "Whisk the dry ingredients together, then the wet ones separately.",
      "Combine gently. A few lumps are fine.",
      "Cook ¼-cup scoops on a buttered pan until bubbles form, then flip.",
    ],
  },
  {
    id: "kimchi-fried-rice", name: "Kimchi Fried Rice", emoji: "🥘", minutes: 15, servings: 2,
    tags: ["Korean", "Spicy", "Quick"],
    ingredients: [
      { name: "rice", amount: "2 cups cooked" }, { name: "kimchi", amount: "1 cup" },
      { name: "eggs", amount: "2" }, { name: "gochujang", amount: "1 tbsp" },
      { name: "green onions", amount: "2 stalks" },
    ],
    staples: ["oil", "sesame oil"],
    steps: [
      "Fry the chopped kimchi for 2 minutes.",
      "Add the rice and gochujang and stir-fry until crispy.",
      "Top with fried eggs and green onions.",
    ],
  },
  {
    id: "peanut-noodles", name: "Thai Peanut Noodles", emoji: "🍜", minutes: 15, servings: 2,
    tags: ["Thai", "Vegan", "Quick"],
    ingredients: [
      { name: "noodles", amount: "8 oz" }, { name: "peanut butter", amount: "¼ cup" },
      { name: "soy sauce", amount: "2 tbsp" }, { name: "lime", amount: "1" },
      { name: "sriracha", amount: "1 tsp" }, { name: "carrots", amount: "1" },
    ],
    staples: ["sugar"],
    steps: [
      "Cook the noodles.",
      "Whisk peanut butter, soy sauce, lime juice, sriracha and a splash of hot water.",
      "Toss with the noodles and shredded carrot.",
    ],
  },
  {
    id: "mango-lassi", name: "Mango Lassi", emoji: "🥭", minutes: 5, servings: 2,
    tags: ["Indian", "Vegetarian", "Quick"],
    ingredients: [
      { name: "greek yogurt", amount: "1 cup" }, { name: "mango", amount: "1" },
      { name: "milk", amount: "½ cup" }, { name: "sugar", amount: "1 tbsp" },
    ],
    staples: [],
    steps: ["Blend everything with a few ice cubes until smooth."],
  },
];

/** Every tag used by any recipe, alphabetically. */
export const ALL_TAGS = [...new Set(RECIPES.flatMap((r) => r.tags))].sort();
