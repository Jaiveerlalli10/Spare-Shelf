// Picks a food emoji for an item name, for the colorful tiles on posts and the pantry.
// Order matters: more specific words come first ("eggplant" before "egg").
const EMOJI = [
  ["eggplant", "🍆"], ["egg", "🥚"], ["peanut", "🥜"], ["soy sauce", "🫙"], ["sauce", "🫙"], ["salsa", "🫙"],
  ["rice", "🍚"], ["noodle", "🍜"], ["ramen", "🍜"], ["pasta", "🍝"], ["spaghetti", "🍝"],
  ["bread", "🍞"], ["bagel", "🥯"], ["tortilla", "🫓"], ["flour", "🌾"], ["oat", "🌾"], ["cereal", "🥣"],
  ["milk", "🥛"], ["yogurt", "🥣"], ["cheese", "🧀"], ["paneer", "🧀"], ["parmesan", "🧀"], ["butter", "🧈"], ["cream", "🥛"],
  ["spinach", "🥬"], ["lettuce", "🥬"], ["kale", "🥬"], ["cabbage", "🥬"], ["kimchi", "🥬"], ["broccoli", "🥦"],
  ["onion", "🧅"], ["garlic", "🧄"], ["ginger", "🫚"], ["tomato", "🍅"], ["potato", "🥔"], ["carrot", "🥕"],
  ["bell pepper", "🫑"], ["chili", "🌶️"], ["jalape", "🌶️"], ["pepper", "🫑"], ["corn", "🌽"], ["cucumber", "🥒"],
  ["mushroom", "🍄"], ["avocado", "🥑"], ["cilantro", "🌿"], ["basil", "🌿"], ["herb", "🌿"], ["mint", "🌿"],
  ["lemon", "🍋"], ["lime", "🍋"], ["apple", "🍎"], ["banana", "🍌"], ["mango", "🥭"], ["berr", "🫐"],
  ["strawberr", "🍓"], ["grape", "🍇"], ["orange", "🍊"], ["peach", "🍑"], ["cherr", "🍒"], ["coconut", "🥥"],
  ["bean", "🫘"], ["chickpea", "🫘"], ["lentil", "🫘"], ["tofu", "🥡"],
  ["chicken", "🍗"], ["turkey", "🍗"], ["beef", "🥩"], ["pork", "🥓"], ["bacon", "🥓"], ["steak", "🥩"],
  ["fish", "🐟"], ["salmon", "🐟"], ["tuna", "🐟"], ["shrimp", "🍤"],
  ["oil", "🫒"], ["olive", "🫒"], ["honey", "🍯"], ["sugar", "🍬"], ["salt", "🧂"], ["spice", "🧂"], ["masala", "🧂"],
  ["chocolate", "🍫"], ["cookie", "🍪"], ["coffee", "☕"], ["tea", "🍵"], ["juice", "🧃"],
];

export function foodEmoji(name) {
  const n = (name || "").toLowerCase();
  const hit = EMOJI.find(([word]) => n.includes(word));
  return hit ? hit[1] : "🧺";
}
