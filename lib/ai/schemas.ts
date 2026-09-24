import { z } from "zod";

// ── Raw AI output schemas ─────────────────────────────────────────────────────
// These describe what the *model* returns. We then map them into the app's
// domain types (lib/types.ts). Anything that does not match is treated as an
// invalid AI response — never trusted.

const confidence = z.number().min(0).max(1).optional();

export const aiIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  confidence,
  // Helpful for grouping, but optional.
  category: z.string().trim().min(1).max(40).nullable().optional(),
});
export type AiIngredient = z.infer<typeof aiIngredientSchema>;

export const pantryDetectionSchema = z.object({
  ingredients: z.array(aiIngredientSchema).min(0),
  notes: z.string().max(500).optional(),
});
export type AiPantryDetection = z.infer<typeof pantryDetectionSchema>;

export const aiNutritionSchema = z.object({
  calories: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  carbsGrams: z.number().nonnegative(),
  fatGrams: z.number().nonnegative(),
  fiberGrams: z.number().nonnegative().optional(),
  sugarGrams: z.number().nonnegative().optional(),
  sodiumMilligrams: z.number().nonnegative().optional(),
  saturatedFatGrams: z.number().nonnegative().optional(),
});
export type AiNutrition = z.infer<typeof aiNutritionSchema>;

const mealType = z.enum(["breakfast", "lunch", "dinner", "snack", "any"]);

const aiRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
});

export const aiRecipeSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().min(1).max(600).default(""),
  mealType: mealType.nullable().optional(),
  cuisine: z.string().trim().max(60).nullable().optional(),
  prepTimeMinutes: z.number().int().min(0).max(720).default(0),
  cookTimeMinutes: z.number().int().min(0).max(720).default(0),
  servings: z.number().int().min(1).max(24).default(2),
  ingredients: z.array(aiRecipeIngredientSchema).min(1),
  instructions: z.array(z.string().trim().min(2)).min(1),
  nutrition: aiNutritionSchema,
});
export type AiRecipe = z.infer<typeof aiRecipeSchema>;

export const recipesResultSchema = z.object({
  recipes: z.array(aiRecipeSchema).min(0),
});
export type AiRecipesResult = z.infer<typeof recipesResultSchema>;

// ── Persisted recipe contract ────────────────────────────────────────────────
// The full shape stored in recipes.recipe_data. Used BOTH at write time
// (saveRecipeAction) and read time (getRecipe/getRecipes — blueprint KI-7),
// so a drifted/malformed JSONB row can never reach the UI.
export const persistedRecipeSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(2000).nullable(),
  mealType: z.string().max(30).nullable(),
  cuisine: z.string().max(60).nullable(),
  prepTimeMinutes: z.number().int().min(0).max(10_000),
  cookTimeMinutes: z.number().int().min(0).max(10_000),
  servings: z.number().int().min(1).max(1000),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        normalized_name: z.string().max(120).optional(),
        quantity: z.number().positive().max(1_000_000).nullable(),
        unit: z.string().max(40).nullable(),
        available: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
  ingredientsAvailable: z.array(z.string().max(120)).max(100),
  ingredientsMissing: z.array(z.string().max(120)).max(100),
  instructions: z.array(z.string().min(1).max(4000)).min(1).max(60),
  nutrition: z.object({
    calories: z.number().min(0).max(100_000),
    proteinGrams: z.number().min(0).max(10_000),
    carbsGrams: z.number().min(0).max(10_000),
    fatGrams: z.number().min(0).max(10_000),
    fiberGrams: z.number().min(0).max(10_000).optional(),
    sugarGrams: z.number().min(0).max(10_000).optional(),
    sodiumMilligrams: z.number().min(0).max(1_000_000).optional(),
    saturatedFatGrams: z.number().min(0).max(10_000).optional(),
  }),
  matchScore: z.number().min(0).max(100),
});
export type PersistedRecipe = z.infer<typeof persistedRecipeSchema>;

export const normalizedIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  normalized_name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(40).nullable().optional(),
});

export const normalizeResultSchema = z.object({
  ingredients: z.array(normalizedIngredientSchema).min(0),
});
export type AiNormalizeResult = z.infer<typeof normalizeResultSchema>;

// ── Form / API input schemas (validated server-side) ─────────────────────────

// Server-side upload guard (audit H-1): strict MIME allowlist + hard per-image
// size cap in base64 chars (~3.3 MB binary). Client-side limits are advisory.
const MAX_DATA_URL_CHARS = 4_500_000;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const scanInputSchema = z.object({
  images: z
    .array(z.string().min(1).max(MAX_DATA_URL_CHARS))
    .min(1)
    .max(6)
    .refine((arr) => arr.every((s) => IMAGE_DATA_URL.test(s)), "Images must be base64 data URLs of type jpeg/png/webp"),
});
export type ScanInput = z.infer<typeof scanInputSchema>;

export const recipeFiltersSchema = z.object({
  servings: z.number().int().min(1).max(24).optional(),
  mealType: mealType.optional(),
  maxCookTimeMinutes: z.number().int().min(5).max(720).optional(),
  cuisine: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(80).optional(),
  excluded: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  count: z.number().int().min(1).max(8).optional(),
});
export type RecipeFilters = z.infer<typeof recipeFiltersSchema>;
