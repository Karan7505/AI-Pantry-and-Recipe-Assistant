import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the provider transport so no real API calls are made.
vi.mock("../lib/ai/provider", () => ({
  callStructured: vi.fn(),
}));

import { callStructured } from "../lib/ai/provider";
import { analyzePantryImage, generateRecipes } from "../lib/ai/services";
import { AiError } from "../lib/ai/errors";

const mocked = vi.mocked(callStructured);

const validDetection = {
  ingredients: [
    { name: "Tomatoes", quantity: 3, unit: "pieces", confidence: 0.95 },
    { name: "tomato", quantity: 2, unit: "pieces", confidence: 0.9 },
    { name: "Milk", quantity: null, unit: null, confidence: 0.55, category: "dairy" },
  ],
};

const validRecipes = {
  recipes: [
    {
      title: "Tomato Basil Pasta",
      description: "Quick pasta.",
      mealType: "dinner",
      cuisine: "Italian",
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      servings: 2,
      ingredients: [
        { name: "Tomatoes", quantity: 3, unit: "pieces" },
        { name: "Basil", quantity: 1, unit: "bunch" },
        { name: "Pasta", quantity: 200, unit: "g" },
      ],
      instructions: ["Boil.", "Sauce."],
      nutrition: { calories: 450, proteinGrams: 12, carbsGrams: 60, fatGrams: 14 },
    },
    {
      title: "Tomato Soup",
      description: "Simple soup.",
      mealType: "lunch",
      cuisine: null,
      prepTimeMinutes: 5,
      cookTimeMinutes: 20,
      servings: 4,
      ingredients: [
        { name: "Tomato", quantity: 4, unit: "pieces" },
        { name: "Cream", quantity: 100, unit: "ml" },
      ],
      instructions: ["Simmer.", "Blend."],
      nutrition: { calories: 220, proteinGrams: 5, carbsGrams: 20, fatGrams: 12 },
    },
  ],
};

beforeEach(() => {
  mocked.mockReset();
});

describe("analyzePantryImage", () => {
  it("returns a merged, confidence-sorted list", async () => {
    mocked.mockResolvedValue(validDetection);
    const out = await analyzePantryImage(["data:image/png;base64,AAA"]);
    expect(out).toHaveLength(2);
    const tomato = out.find((i) => i.name === "Tomatoes");
    expect(tomato?.quantity).toBe(5); // 3 + 2 merged
    expect(tomato?.unit).toBe("pieces");
  });

  it("throws a typed empty error when nothing is detected", async () => {
    mocked.mockResolvedValue({ ingredients: [], notes: "No food visible." });
    await expect(analyzePantryImage(["data:image/png;base64,AAA"])).rejects.toMatchObject({
      code: "empty",
    });
    const err = (await analyzePantryImage(["data:image/png;base64,AAA"]).catch((e) => e)) as AiError;
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toContain("No food visible"); // model notes carried in details
    expect(err.userMessage.length).toBeGreaterThan(0); // friendly, user-safe
  });

  it("throws invalid_response when the model output fails Zod", async () => {
    mocked.mockResolvedValue({ ingredients: [{ name: "", confidence: 2 }] });
    await expect(analyzePantryImage(["data:image/png;base64,AAA"])).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("propagates provider-level typed errors", async () => {
    mocked.mockRejectedValue(new AiError("boom", "rate_limit"));
    await expect(analyzePantryImage(["data:image/png;base64,AAA"])).rejects.toMatchObject({
      code: "rate_limit",
    });
  });
});

describe("generateRecipes", () => {
  const pantry = [{ name: "Tomatoes" }, { name: "Basil" }];

  it("flags availability, computes match scores, and ranks best-first", async () => {
    mocked.mockResolvedValue(validRecipes);
    const recipes = await generateRecipes(pantry, { excluded: [] });
    expect(recipes).toHaveLength(2);
    // Pasta: 2/3 owned (66.7%), Soup: 1/2 owned (50%) → pasta ranks first.
    expect(recipes[0].title).toBe("Tomato Basil Pasta");
    const soup = recipes.find((r) => r.title === "Tomato Soup")!;
    expect(soup.matchScore).toBe(50);
    expect(soup.ingredientsMissing).toEqual(["Cream"]);
    const pasta = recipes.find((r) => r.title === "Tomato Basil Pasta")!;
    expect(pasta.matchScore).toBeCloseTo(66.7, 1);
    expect(pasta.ingredients[0].available).toBe(true);
    expect(pasta.ingredients[2].available).toBe(false);
  });

  it("filters out excluded ingredients", async () => {
    mocked.mockResolvedValue(validRecipes);
    const recipes = await generateRecipes(pantry, { excluded: ["pasta", "cream"] });
    // Both recipes now 100% (all remaining ingredients owned); tie broken by cook time.
    expect(recipes.every((r) => r.matchScore === 100)).toBe(true);
    const pasta = recipes.find((r) => r.title === "Tomato Basil Pasta");
    expect(pasta?.ingredients).toHaveLength(2);
    const soup = recipes.find((r) => r.title === "Tomato Soup");
    expect(soup?.ingredients).toHaveLength(1);
  });

  it("throws empty when the model returns no recipes", async () => {
    mocked.mockResolvedValue({ recipes: [] });
    await expect(generateRecipes(pantry, { excluded: [] })).rejects.toMatchObject({ code: "empty" });
  });

  it("throws invalid_response for malformed recipe JSON", async () => {
    mocked.mockResolvedValue({ recipes: [{ title: "X" }] });
    await expect(generateRecipes(pantry, { excluded: [] })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});


