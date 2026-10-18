// Gemini, through Firebase AI Logic. Firebase holds the Gemini key on its servers, so there is
// no key in this app; App Check (see firebase.js) keeps other sites from using our quota.
// In demo mode there's no Firebase, so `aiReady` is false and the AI buttons are hidden.
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from "firebase/ai";
import { app } from "./firebase";
import { tasteForPrompt } from "./taste";

// Tried in order: if one is busy or out of free quota (5 requests a minute each), the next one is used.
// "-latest" names follow Google's newest Flash models, so they don't get retired out from under us.
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];

export const aiReady = Boolean(app);
const ai = app ? getAI(app, { backend: new GoogleAIBackend() }) : null;

// Asks Gemini for JSON shaped like `schema` and returns it parsed.
async function askForJson(schema, parts) {
  if (!ai) throw new Error("AI isn't available in demo mode.");
  let lastError;
  for (const name of MODELS) {
    try {
      const model = getGenerativeModel(ai, {
        model: name,
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
      });
      const result = await model.generateContent(parts);
      return JSON.parse(result.response.text());
    } catch (err) {
      console.warn(`Gemini (${name}) failed:`, err);
      lastError = err;
    }
  }
  if (/quota|429|high demand|503|500/i.test(lastError?.message || "")) {
    throw new Error("Gemini is busy right now. Try again in a minute.");
  }
  throw lastError;
}

// ---------- Recipe ideas from your pantry ----------

const recipeSchema = Schema.object({
  properties: {
    recipes: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          emoji: Schema.string({ description: "One food emoji for the dish" }),
          minutes: Schema.integer(),
          servings: Schema.integer(),
          tags: Schema.array({ items: Schema.string(), description: "1 to 3 short tags like Quick, Vegetarian, Indian" }),
          ingredients: Schema.array({
            items: Schema.object({
              properties: {
                name: Schema.string({ description: "Plain ingredient name, like 'eggs' or 'soy sauce'" }),
                amount: Schema.string({ description: "Like '2', '1 cup', '2 cloves'" }),
              },
            }),
          }),
          staples: Schema.array({ items: Schema.string(), description: "Basics like salt, oil, pepper, water" }),
          steps: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
});

/**
 * Recipe ideas that use what's in `pantry` ([{ name, quantity, expiresOn }]),
 * personalized with the person's taste profile (`taste`, optional; see taste.js).
 * Returns recipes in the same shape as RECIPES in recipes.js, so RecipeDetail can show them.
 */
export async function suggestRecipes(pantry, taste) {
  const list = pantry
    .map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ""}${i.expiresOn ? `, best by ${i.expiresOn}` : ""}`)
    .join("\n");
  const tastes = tasteForPrompt(taste);
  const prompt = `You help college students cook with what they have. Today is ${new Date().toISOString().slice(0, 10)}.
Their pantry:
${list}

Suggest 3 simple, realistic recipes a student could make in a dorm or apartment kitchen.
Use as many pantry items as you can, and favor ones that expire soon. It's fine to need 1 to 3 extra ingredients.
Keep ingredient names short and plain, matching the pantry names when it's the same thing.
Don't list basics (salt, pepper, oil, water) as ingredients; put them in staples instead.
Keep steps short: 3 to 5 steps.${tastes ? `

Personalize the recipes for this person. Diet and allergy rules are strict; the rest are preferences:
${tastes}` : ""}`;

  const { recipes = [] } = await askForJson(recipeSchema, prompt);
  return recipes.map((r, i) => ({
    ...r,
    id: `ai-${Date.now()}-${i}`,
    emoji: r.emoji || "🍽️",
    tags: r.tags || [],
    ingredients: r.ingredients || [],
    staples: r.staples || [],
    steps: r.steps || [],
    ai: true,
  }));
}

// ---------- Fill in a post from a photo ----------

const photoSchema = Schema.object({
  properties: {
    isFood: Schema.boolean({ description: "False if the photo doesn't show food or an ingredient" }),
    item: Schema.string({ description: "Short ingredient name, like 'Eggs' or 'Basmati rice'" }),
    quantity: Schema.string({ description: "Visible amount, like '6', '1 lb', 'half a bag'" }),
    estValue: Schema.number({ description: "Rough US grocery price in dollars for that amount" }),
    expiresOn: Schema.string({ description: "Best-by date as YYYY-MM-DD, only if printed and readable on the package" }),
    notes: Schema.string({ description: "One short line: common allergens or storage tips. Empty if none." }),
  },
  optionalProperties: ["quantity", "estValue", "expiresOn", "notes"],
});

/**
 * Looks at a food photo (a base64 JPEG from readFoodPhoto) and returns
 * { item, quantity, estValue, expiresOn, notes } for the post form.
 */
export async function describeFoodPhoto(base64Jpeg) {
  const result = await askForJson(photoSchema, [
    { inlineData: { mimeType: "image/jpeg", data: base64Jpeg } },
    "This is a photo of food a college student wants to share or trade with neighbors. Describe it for a listing.",
  ]);
  if (!result.isFood || !result.item) throw new Error("Couldn't spot any food in that photo. Try a closer shot.");
  return result;
}
