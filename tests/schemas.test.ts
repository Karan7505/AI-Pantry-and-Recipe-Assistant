import { describe, it, expect } from "vitest";
import {
  pantryDetectionSchema,
  recipesResultSchema,
  aiNutritionSchema,
  persistedRecipeSchema,
  scanInputSchema,
  recipeFiltersSchema,
} from "../lib/ai/schemas";
import { extractJson } from "../lib/ai/provider";

describe("pantryDetectionSchema", () => {
  it("accepts a valid detection", () => {
    const r = pantryDetectionSchema.safeParse({
      ingredients: [
        { name: "Eggs", quantity: 6, unit: "pieces", confidence: 0.9 },
        { name: "Milk", quantity: null, unit: null, confidence: 0.7, category: "dairy" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range confidence and empty names", () => {
    expect(
      pantryDetectionSchema.safeParse({ ingredients: [{ name: "Eggs", confidence: 1.5 }] }).success,
    ).toBe(false);
    expect(
      pantryDetectionSchema.safeParse({ ingredients: [{ name: "  " }] }).success,
    ).toBe(false);
  });

  it("accepts an empty ingredient list (empty pantry)", () => {
    expect(pantryDetectionSchema.safeParse({ ingredients: [] }).success).toBe(true);
  });
});

describe("recipesResultSchema", () => {
  const valid = {
    recipes: [
      {
        title: "Omelette",
        description: "Classic.",
        mealType: "breakfast",
        cuisine: null,
        prepTimeMinutes: 5,
        cookTimeMinutes: 10,
        servings: 2,
        ingredients: [{ name: "Eggs", quantity: 4, unit: "pieces" }],
        instructions: ["Beat eggs.", "Cook."],
        nutrition: { calories: 300, proteinGrams: 18, carbsGrams: 1, fatGrams: 24 },
      },
    ],
  };

  it("accepts a valid recipe set", () => {
    expect(recipesResultSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a recipe with no ingredients", () => {
    const bad = { recipes: [{ ...valid.recipes[0], ingredients: [] }] };
    expect(recipesResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative calories", () => {
    const bad = { recipes: [{ ...valid.recipes[0], nutrition: { ...valid.recipes[0].nutrition, calories: -5 } }] };
    expect(recipesResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown meal types", () => {
    const bad = { recipes: [{ ...valid.recipes[0], mealType: "brunch" }] };
    expect(recipesResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe("aiNutritionSchema", () => {
  it("requires the four core macros, optional extras", () => {
    expect(aiNutritionSchema.safeParse({ calories: 100, proteinGrams: 5, carbsGrams: 10, fatGrams: 4 }).success).toBe(true);
    expect(aiNutritionSchema.safeParse({ calories: 100, proteinGrams: 5, carbsGrams: 10 }).success).toBe(false);
    expect(
      aiNutritionSchema.safeParse({ calories: 100, proteinGrams: 5, carbsGrams: 10, fatGrams: 4, sodiumMilligrams: 500 }).success,
    ).toBe(true);
  });
});

describe("scanInputSchema", () => {
  it("requires 1-6 data URLs", () => {
    expect(scanInputSchema.safeParse({ images: ["data:image/png;base64,AAA"] }).success).toBe(true);
    expect(scanInputSchema.safeParse({ images: [] }).success).toBe(false);
    expect(scanInputSchema.safeParse({ images: ["https://x/y.png"] }).success).toBe(false);
  });
});

describe("recipeFiltersSchema", () => {
  it("all fields optional with sensible bounds", () => {
    expect(recipeFiltersSchema.safeParse({}).success).toBe(true);
    expect(recipeFiltersSchema.parse({}).excluded).toEqual([]);
    expect(recipeFiltersSchema.safeParse({ servings: 0 }).success).toBe(false);
    expect(recipeFiltersSchema.safeParse({ maxCookTimeMinutes: 1000 }).success).toBe(false);
  });
});

describe("persistedRecipeSchema (KI-7: read-time validation of recipe_data)", () => {
  const valid = {
    title: "Pasta",
    description: "Quick pasta",
    mealType: "dinner",
    cuisine: "Italian",
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 2,
    ingredients: [
      { name: "Pasta", quantity: 200, unit: "g", available: true },
      { name: "Tomato", quantity: 2, unit: "pieces", available: false },
    ],
    ingredientsAvailable: ["Pasta"],
    ingredientsMissing: ["Tomato"],
    instructions: ["Boil water.", "Cook pasta."],
    nutrition: { calories: 500, proteinGrams: 20, carbsGrams: 70, fatGrams: 15 },
    matchScore: 50,
  };

  it("accepts a valid persisted recipe", () => {
    expect(persistedRecipeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects malformed JSONB shapes", () => {
    expect(persistedRecipeSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
    expect(persistedRecipeSchema.safeParse({ ...valid, instructions: [] }).success).toBe(false);
    expect(persistedRecipeSchema.safeParse({ ...valid, nutrition: { calories: -5 } }).success).toBe(false);
    expect(persistedRecipeSchema.safeParse(null).success).toBe(false);
    expect(persistedRecipeSchema.safeParse("not an object").success).toBe(false);
  });
});

describe("extractJson", () => {
  it("parses strict JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("isolates a balanced object inside prose", () => {
    expect(extractJson('Sure! Here is the result: {"a": {"b": 2}} hope that helps')).toEqual({ a: { b: 2 } });
  });

  it("returns null for garbage", () => {
    expect(extractJson("no json here")).toBe(null);
    expect(extractJson("{broken")).toBe(null);
  });
});
