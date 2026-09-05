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

export const scanInputSchema = z.object({
  // base64 data URLs of the uploaded images (kept in-memory; images are not
  // persisted to Storage unless the user opts in).
  images: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .refine((arr) => arr.every((s) => s.startsWith("data:")), "images must be data URLs"),
});
export type ScanInput = z.infer<typeof scanInputSchema>;

export const recipeFiltersSchema = z.object({
  servings: z.number().int().min(1).max(24).optional(),
  mealType: mealType.optional(),
  maxCookTimeMinutes: z.number().int().min(5).max(720).optional(),
  cuisine: z.string().trim().max(60).optional(),
  dietary: z.string().trim().max(80).optional(),
  excluded: z.array(z.string().trim().min(1)).default([]),
  count: z.number().int().min(1).max(8).optional(),
});
export type RecipeFilters = z.infer<typeof recipeFiltersSchema>;
