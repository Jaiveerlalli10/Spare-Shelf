// Matches recipe ingredients to pantry items and board posts by name.
//
// It compares words, not raw text: "rice" matches "Basmati rice" and "onion" matches "Onions",
// but "egg" does NOT match "eggplant". An ingredient matches when every word in it
// appears in the item's name.

function singular(word) {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"; // berries -> berry
  if (word.endsWith("oes")) return word.slice(0, -2); // tomatoes -> tomato
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1); // eggs -> egg
  return word;
}

function words(text) {
  return (text || "").toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular);
}

export function nameMatches(ingredientName, itemName) {
  const itemWords = new Set(words(itemName));
  const needed = words(ingredientName);
  return needed.length > 0 && needed.every((w) => itemWords.has(w));
}

/** The pantry item that covers this ingredient, or undefined. */
export function findInPantry(ingredientName, pantry) {
  return pantry.find((item) => nameMatches(ingredientName, item.name));
}

/**
 * Offers on the board for this ingredient that the user could pick up:
 * other people's open offers, plus ones the user has already claimed.
 */
export function findOffers(ingredientName, posts, user) {
  return posts.filter(
    (p) =>
      p.type === "offer" &&
      p.ownerId !== user.uid &&
      (p.status === "open" || (p.status === "claimed" && p.claimedById === user.uid)) &&
      nameMatches(ingredientName, p.item)
  );
}

/**
 * The user's offers that are still active (open or claimed), keyed by the pantry entry they came from.
 * Used to highlight pantry items that are on the board, and to keep recipes from counting them.
 */
export function activeOffersByPantryItem(posts, user) {
  const map = new Map();
  for (const p of posts) {
    if (p.type === "offer" && p.ownerId === user.uid && p.pantryItemId && p.status !== "completed") {
      map.set(p.pantryItemId, p);
    }
  }
  return map;
}
