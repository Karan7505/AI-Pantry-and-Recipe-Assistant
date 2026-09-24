import { z } from "zod";
import { AiError } from "./errors";
import { callStructured } from "./provider";
import { pantryDetectionSchema, recipesResultSchema } from "./schemas";
import {
  PANTRY_DETECTION_SYSTEM,
  buildDetectionUserPrompt,
  buildRecipeSystemPrompt,
  buildRecipeUserPrompt,
} from "./prompts";
import { mergeIngredients, normalizeIngredientName } from "../ingredients";
import { finalizeRecipe, rankRecipes } from "../match";
import type { Recipe, RecipeFilters, Nutrition } from "../types";

function validateWith<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AiError(
      `AI output failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .slice(0, 3)
        .join("; ")}`,
      "invalid_response",
    );
  }
  return result.data;
}

/**
 * analyzePantryImage — detect ingredients from one or more image data URLs.
 * Returns a deduplicated, unit-aware merged list. Never fabricates quantities.
 */
export async function analyzePantryImage(images: string[]): Promise<{ name: string; quantity: number | null; unit: string | null; confidence: number }[]> {
  const raw = await callStructured<unknown>({
    system: PANTRY_DETECTION_SYSTEM,
    user: buildDetectionUserPrompt(),
    images,
    vision: true,
  });
  const parsed = validateWith(pantryDetectionSchema, raw);
  if (parsed.ingredients.length === 0) {
    throw new AiError(
      parsed.notes ?? "No recognizable food items were found in the image(s).",
      "empty",
    );
  }
  const merged = mergeIngredients(
    parsed.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
    })),
  );
  // Carry an average confidence per merged item where the model provided any.
  const withConfidence = merged.map((m) => {
    const parts = parsed.ingredients.filter((i) => normalizeIngredientName(i.name) === m.normalized_name);
    const confs = parts.map((p) => p.confidence).filter((c): c is number => c != null);
    const confidence = confs.length ? Math.min(...confs) : 0.5;
    return { name: m.name, quantity: m.quantity, unit: m.unit, confidence };
  });
  return withConfidence.sort((a, b) => b.confidence - a.confidence);
}

/**
 * generateRecipes — generate several recipes from the confirmed pantry,
 * respecting optional filters. Returns ranked, availability-flagged recipes.
 */
export async function generateRecipes(
  pantry: { name: string }[],
  filters: RecipeFilters,
): Promise<Recipe[]> {
  const count = filters.count ?? 4;
  const raw = await callStructured<unknown>({
    system: buildRecipeSystemPrompt(count),
    user: buildRecipeUserPrompt(
      pantry.map((p) => ({ name: p.name, quantity: null, unit: null })),
      {
        servings: filters.servings,
        mealType: filters.mealType,
        maxCookTimeMinutes: filters.maxCookTimeMinutes,
        cuisine: filters.cuisine,
        dietary: filters.dietary,
        excluded: filters.excluded ?? [],
      },
    ),
  });
  const parsed = validateWith(recipesResultSchema, raw);
  if (parsed.recipes.length === 0) {
    throw new AiError("No recipes could be generated for this pantry.", "empty");
  }

  const excludedKeys = new Set((filters.excluded ?? []).map(normalizeIngredientName).filter(Boolean));
  const recipes: Recipe[] = parsed.recipes
    .map((r) => {
      const filtered = r.ingredients.filter(
        (i) => !excludedKeys.has(normalizeIngredientName(i.name)),
      );
      if (filtered.length === 0) return null;
      return finalizeRecipe(
        {
          title: r.title,
          description: r.description,
          mealType: r.mealType ?? null,
          cuisine: r.cuisine ?? null,
          prepTimeMinutes: r.prepTimeMinutes,
          cookTimeMinutes: r.cookTimeMinutes,
          servings: filters.servings ?? r.servings,
          ingredients: filtered,
          instructions: r.instructions,
          nutrition: r.nutrition as Nutrition,
        },
        pantry,
      );
    })
    .filter((r): r is Recipe => r !== null);

  // If a max cook time was given, prefer recipes under it (but keep the list full).
  if (filters.maxCookTimeMinutes) {
    const cap = filters.maxCookTimeMinutes;
    recipes.sort((a, b) => (a.cookTimeMinutes <= cap ? 0 : 1) - (b.cookTimeMinutes <= cap ? 0 : 1));
  }
  return rankRecipes(recipes);
}


