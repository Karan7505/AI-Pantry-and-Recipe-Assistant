import { normalizeIngredientName } from "./ingredients";
import type { Recipe, RecipeIngredient } from "./types";

export interface MatchResult {
  /** 0..100 — share of distinct required ingredients the pantry covers. */
  score: number;
  total: number;
  have: number;
  missing: number;
  available: string[]; // display names
  missingNames: string[]; // display names
}

function pantryKeys(pantry: { name: string }[]): Set<string> {
  return new Set(pantry.map((p) => normalizeIngredientName(p.name)).filter(Boolean));
}

/**
 * Score a recipe's ingredients against the pantry. Comparison is on normalized
 * names only (quantities are not trusted for matching).
 */
export function scoreRecipe(
  ingredients: { name: string }[],
  pantry: { name: string }[],
): MatchResult {
  const keys = pantryKeys(pantry);
  const available: string[] = [];
  const missingNames: string[] = [];
  for (const ing of ingredients) {
    const key = normalizeIngredientName(ing.name);
    if (key && keys.has(key)) available.push(ing.name);
    else missingNames.push(ing.name);
  }
  const total = ingredients.length;
  const score = total === 0 ? 100 : Math.round((available.length / total) * 1000) / 10;
  return {
    score,
    total,
    have: available.length,
    missing: missingNames.length,
    available,
    missingNames,
  };
}

export interface RawRecipe {
  title: string;
  description: string;
  mealType: Recipe["mealType"];
  cuisine: string | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  ingredients: { name: string; quantity?: number | null; unit?: string | null }[];
  instructions: string[];
  nutrition: Recipe["nutrition"];
}

/**
 * Build a fully-formed Recipe from a raw AI recipe + the pantry: flags each
 * ingredient's availability and computes the match score.
 */
export function finalizeRecipe(raw: RawRecipe, pantry: { name: string }[]): Recipe {
  const keys = pantryKeys(pantry);
  const ingredients: RecipeIngredient[] = raw.ingredients.map((i) => {
    const key = normalizeIngredientName(i.name);
    return {
      name: i.name,
      normalized_name: key,
      quantity: i.quantity ?? null,
      unit: i.unit ?? null,
      available: Boolean(key && keys.has(key)),
    };
  });
  const match = scoreRecipe(ingredients, pantry);
  return {
    title: raw.title,
    description: raw.description,
    mealType: raw.mealType,
    cuisine: raw.cuisine,
    prepTimeMinutes: raw.prepTimeMinutes,
    cookTimeMinutes: raw.cookTimeMinutes,
    servings: raw.servings,
    ingredients,
    ingredientsAvailable: match.available,
    ingredientsMissing: match.missingNames,
    instructions: raw.instructions,
    nutrition: raw.nutrition,
    matchScore: match.score,
  };
}

/** Rank recipes: best match first, then fewer missing, then shorter cook time. */
export function rankRecipes(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const ma = a.ingredients.filter((i) => !i.available).length;
    const mb = b.ingredients.filter((i) => !i.available).length;
    if (ma !== mb) return ma - mb;
    return a.cookTimeMinutes - b.cookTimeMinutes;
  });
}

/** "100% — You have everything" style label. */
export function matchLabel(score: number, missing: number): string {
  if (missing === 0) return "You have everything";
  if (missing === 1) return "Missing 1 ingredient";
  return `Missing ${missing} ingredients`;
}
