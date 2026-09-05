import { describe, it, expect } from "vitest";
import type { RecipeIngredient } from "../lib/types";
import { scoreRecipe, finalizeRecipe, rankRecipes, matchLabel } from "../lib/match";

const pantry = [
  { name: "Tomatoes" },
  { name: "Tomato" },
  { name: "Basil" },
  { name: "Cheddar" },
];

describe("scoreRecipe", () => {
  it("scores 100% when all ingredients are owned (dedupe-tolerant)", () => {
    const r = scoreRecipe([{ name: "tomato" }, { name: "Basil" }], pantry);
    expect(r.score).toBe(100);
    expect(r.missing).toBe(0);
  });

  it("scores partial matches and lists missing items", () => {
    const r = scoreRecipe([{ name: "Tomato" }, { name: "Basil" }, { name: "Olive oil" }], pantry);
    expect(r.score).toBeCloseTo(66.7, 1);
    expect(r.missingNames).toEqual(["Olive oil"]);
  });

  it("scores 0% for a fully missing recipe", () => {
    const r = scoreRecipe([{ name: "Beef" }, { name: "Wine" }], pantry);
    expect(r.score).toBe(0);
  });
});

describe("finalizeRecipe", () => {
  const raw = {
    title: "Tomato Basil Pasta",
    description: "A quick pasta.",
    mealType: "dinner" as const,
    cuisine: "Italian",
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 2,
    ingredients: [
      { name: "Tomatoes", quantity: 3, unit: "pieces" },
      { name: "Basil", quantity: 1, unit: "bunch" },
      { name: "Pasta", quantity: 200, unit: "g" },
    ],
    instructions: ["Boil pasta.", "Sauce with tomatoes and basil."],
    nutrition: {
      calories: 450,
      proteinGrams: 12,
      carbsGrams: 60,
      fatGrams: 14,
    },
  };

  it("flags availability per ingredient and sets arrays + score", () => {
    const recipe = finalizeRecipe(raw, pantry);
    expect(recipe.ingredients[0].available).toBe(true);
    expect(recipe.ingredients[1].available).toBe(true);
    expect(recipe.ingredients[2].available).toBe(false);
    expect(recipe.ingredientsAvailable).toEqual(["Tomatoes", "Basil"]);
    expect(recipe.ingredientsMissing).toEqual(["Pasta"]);
    expect(recipe.matchScore).toBeCloseTo(66.7, 1);
  });
});

describe("rankRecipes", () => {
  const base = {
    title: "X",
    description: "",
    mealType: null,
    cuisine: null,
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    servings: 2,
    ingredients: [] as RecipeIngredient[],
    ingredientsAvailable: [],
    ingredientsMissing: [],
    instructions: ["step"],
    nutrition: { calories: 1, proteinGrams: 1, carbsGrams: 1, fatGrams: 1 },
  };

  it("sorts best match first, then fewer missing, then shorter cook time", () => {
    const a = { ...base, title: "A", matchScore: 75, cookTimeMinutes: 30 };
    const b = { ...base, title: "B", matchScore: 100, cookTimeMinutes: 45 };
    const c = { ...base, title: "C", matchScore: 75, cookTimeMinutes: 15 };
    const ranked = rankRecipes([a, b, c]);
    expect(ranked.map((r) => r.title)).toEqual(["B", "C", "A"]);
  });
});

describe("matchLabel", () => {
  it("labels by missing count", () => {
    expect(matchLabel(100, 0)).toBe("You have everything");
    expect(matchLabel(90, 1)).toBe("Missing 1 ingredient");
    expect(matchLabel(75, 2)).toBe("Missing 2 ingredients");
  });
});
