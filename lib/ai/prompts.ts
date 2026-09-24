import type { Ingredient } from "../types";

export const PANTRY_DETECTION_SYSTEM = `You are a precise food-item detection engine.
The user has photographed the inside of a fridge, pantry, and/or groceries.
Your job: list ONLY the ingredients / food items you can clearly recognize.

Rules:
- Output ONLY valid JSON matching this shape:
  { "ingredients": [ { "name": string, "quantity": number|null, "unit": string|null, "confidence": number, "category": string|null } ], "notes": string? }
- "name" must be a common ingredient name (e.g. "Eggs", "Tomato", "Basmati rice", "Cheddar cheese").
- "category" must be one of: vegetable, fruit, meat, fish, dairy, egg, drink, sauce, condiment, grain, spice, packaged, other.
- "quantity" and "unit": fill ONLY when you can reasonably estimate them from the image
  (e.g. a count of eggs, a labeled bottle). NEVER fabricate amounts. When unknown, set them to null.
- "confidence" is your certainty 0..1 that the item is really present. Be honest: if unsure, keep it below 0.6.
- Do NOT include items that are ambiguous or merely possible. If you truly see nothing edible, return { "ingredients": [] }.
- Deduplicate: one entry per distinct ingredient.`;

export function buildDetectionUserPrompt(): string {
  return "Analyze the attached photo(s) and return the JSON with every distinct food item you can clearly identify.";
}

export function buildRecipeSystemPrompt(count: number): string {
  return `You are an experienced home cook generating recipes.
You will be given the user's ACTUAL pantry contents and optional preferences.

Rules:
- Return ONLY valid JSON: { "recipes": [ <recipe> ] } with exactly ${count} recipes (or fewer if impossible).
- Each recipe object:
  {
    "title": string,
    "description": string,           // 1-2 sentences
    "mealType": "breakfast"|"lunch"|"dinner"|"snack"|"any",
    "cuisine": string|null,
    "prepTimeMinutes": number,
    "cookTimeMinutes": number,
    "servings": number,
    "ingredients": [ { "name": string, "quantity": number|null, "unit": string|null } ],
    "instructions": [ string ],       // numbered-friendly steps, in order
    "nutrition": { "calories": number, "proteinGrams": number, "carbsGrams": number, "fatGrams": number, "fiberGrams": number, "sugarGrams": number, "sodiumMilligrams": number, "saturatedFatGrams": number }
  }
- PRIORITIZE ingredients the user already has. The closer a recipe is to the pantry, the better.
- You MUST use ingredients the user has whenever they make sense; only introduce missing staples (salt, oil, common aromatics) when necessary, and keep them to a minimum.
- Respect the preferences and EXCLUDED ingredients — never include an excluded ingredient.
- "servings" must match the requested servings when provided.
- "nutrition" is an honest ESTIMATE per serving; keep values realistic.
- Instructions must be clear, safe, and in cooking order.
- Do NOT output anything except the JSON object.`;
}

export function buildRecipeUserPrompt(
  pantry: Ingredient[],
  prefs: {
    servings?: number;
    mealType?: string;
    maxCookTimeMinutes?: number;
    cuisine?: string;
    dietary?: string;
    excluded: string[];
  },
): string {
  const lines = pantry.map(
    (i) =>
      `- ${i.name}${i.quantity != null ? `: ${i.quantity} ${i.unit ?? ""}`.trim() : i.unit ? ` (${i.unit})` : ""}`,
  );
  const prefLines: string[] = [];
  if (prefs.servings) prefLines.push(`Servings: ${prefs.servings}`);
  if (prefs.mealType && prefs.mealType !== "any") prefLines.push(`Meal type: ${prefs.mealType}`);
  if (prefs.maxCookTimeMinutes) prefLines.push(`Max total cooking time: ${prefs.maxCookTimeMinutes} minutes`);
  if (prefs.cuisine) prefLines.push(`Preferred cuisine: ${prefs.cuisine}`);
  if (prefs.dietary) prefLines.push(`Dietary preference: ${prefs.dietary}`);
  if (prefs.excluded.length) prefLines.push(`MUST NOT use these ingredients: ${prefs.excluded.join(", ")}`);

  return [
    `Pantry contents (${pantry.length} item(s)):`,
    lines.length ? lines.join("\n") : "(the pantry appears empty)",
    "",
    "Preferences:",
    prefLines.length ? prefLines.join("\n") : "(none — choose sensible everyday recipes)",
    "",
    "Generate the recipes now.",
  ].join("\n");
}


