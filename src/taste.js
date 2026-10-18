// Taste profile: food preferences saved on your (private) profile, used to personalize
// Gemini's recipe ideas. Everything is optional.

export const DIETS = ["No restrictions", "Vegetarian", "Vegan", "Pescatarian", "Halal", "Kosher"];
export const ALLERGIES = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Fish", "Shellfish", "Sesame"];
export const CUISINES = ["American", "Chinese", "Indian", "Italian", "Japanese", "Korean", "Mediterranean", "Mexican", "Middle Eastern", "Thai"];
export const SPICE = ["Mild", "Medium", "Hot"];
export const TIME = ["Under 15 min", "Under 30 min", "Any time"];

export const EMPTY_TASTE = { diet: "", allergies: [], cuisines: [], spice: "", time: "", dislikes: "" };

/** Fills in missing fields so older profiles (or none) still work. */
export function normalizeTaste(taste) {
  const t = { ...EMPTY_TASTE, ...(taste || {}) };
  return {
    diet: DIETS.includes(t.diet) ? t.diet : "",
    allergies: (t.allergies || []).filter((a) => ALLERGIES.includes(a)),
    cuisines: (t.cuisines || []).filter((c) => CUISINES.includes(c)),
    spice: SPICE.includes(t.spice) ? t.spice : "",
    time: TIME.includes(t.time) ? t.time : "",
    dislikes: String(t.dislikes || "").slice(0, 200),
  };
}

/** True if the person filled in anything. */
export function hasTaste(taste) {
  const t = normalizeTaste(taste);
  return Boolean((t.diet && t.diet !== "No restrictions") || t.allergies.length || t.cuisines.length || t.spice || t.time || t.dislikes.trim());
}

/** Short summary for the Recipes tab, like "Vegetarian · no peanuts · likes Indian, Thai". */
export function tasteSummary(taste) {
  const t = normalizeTaste(taste);
  const bits = [];
  if (t.diet && t.diet !== "No restrictions") bits.push(t.diet);
  if (t.allergies.length) bits.push(`no ${t.allergies.join(", ").toLowerCase()}`);
  if (t.cuisines.length) bits.push(`likes ${t.cuisines.join(", ")}`);
  if (t.spice) bits.push(`${t.spice.toLowerCase()} spice`);
  if (t.time && t.time !== "Any time") bits.push(t.time.toLowerCase());
  return bits.join(" · ");
}

/** The taste profile as lines for Gemini's prompt (empty string if nothing is set). */
export function tasteForPrompt(taste) {
  if (!hasTaste(taste)) return "";
  const t = normalizeTaste(taste);
  const lines = [];
  if (t.diet && t.diet !== "No restrictions") lines.push(`- Diet: ${t.diet}. Every recipe MUST fit this diet.`);
  if (t.allergies.length) lines.push(`- Allergies: ${t.allergies.join(", ")}. NEVER use these or anything containing them.`);
  if (t.dislikes.trim()) lines.push(`- Dislikes: ${t.dislikes.trim()}. Avoid these.`);
  if (t.cuisines.length) lines.push(`- Favorite cuisines: ${t.cuisines.join(", ")}. Lean toward these.`);
  if (t.spice) lines.push(`- Spice level: ${t.spice}.`);
  if (t.time && t.time !== "Any time") lines.push(`- Cooking time: ${t.time.toLowerCase()} per recipe.`);
  return lines.join("\n");
}
