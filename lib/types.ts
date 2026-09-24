// Shared domain types across the app (DB rows, AI contracts, UI models).

export type Category =
  | "vegetable"
  | "fruit"
  | "meat"
  | "fish"
  | "dairy"
  | "egg"
  | "drink"
  | "sauce"
  | "condiment"
  | "grain"
  | "spice"
  | "packaged"
  | "other";

export const CATEGORIES: Category[] = [
  "vegetable",
  "fruit",
  "meat",
  "fish",
  "dairy",
  "egg",
  "drink",
  "sauce",
  "condiment",
  "grain",
  "spice",
  "packaged",
  "other",
];

/** An ingredient as seen by the user (pantry, detection, recipe step). */
export interface Ingredient {
  name: string;
  quantity: number | null; // null = unknown / cannot be estimated
  unit: string | null; // e.g. "pieces", "g", "ml", "cups"
  confidence?: number; // 0..1, AI detections only
}

// ── Database rows (mirror supabase/migrations schema) ────────────────────────

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  category: Category | null;
  expiration_date: string | null; // ISO date
  created_at: string;
  updated_at: string;
}

export interface ScanRow {
  id: string;
  user_id: string;
  detected_data: Ingredient[];
  created_at: string;
}

export interface RecipeRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  recipe_data: Recipe;
  created_at: string;
}

export interface GroceryListRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GroceryItemRow {
  id: string;
  grocery_list_id: string;
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  completed: boolean;
  source_recipe_title: string | null;
  created_at: string;
}

// ── Recipe domain model ───────────────────────────────────────────────────────

export interface Nutrition {
  calories: number; // per serving
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMilligrams?: number;
  saturatedFatGrams?: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  available: boolean;
  normalized_name?: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "any";

export interface Recipe {
  title: string;
  description: string;
  mealType: MealType | null;
  cuisine: string | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[]; // all ingredients, with availability flags
  ingredientsAvailable: string[]; // display names the user has
  ingredientsMissing: string[]; // display names the user lacks
  instructions: string[];
  nutrition: Nutrition;
  /** 0..100 — share of required ingredients the pantry covers. */
  matchScore: number;
}

export interface RecipeFilters {
  servings?: number;
  mealType?: MealType;
  maxCookTimeMinutes?: number;
  cuisine?: string;
  dietary?: string;
  excluded: string[];
  count?: number;
}
