import { describe, it, expect } from "vitest";
import {
  normalizeIngredientName,
  singularize,
  normalizeUnit,
  unitsCompatible,
  mergeIngredients,
  displayIngredientName,
} from "../lib/ingredients";

describe("normalizeIngredientName", () => {
  it("collapses casing and plural variants to one key", () => {
    expect(normalizeIngredientName("tomato")).toBe("tomato");
    expect(normalizeIngredientName("Tomato")).toBe("tomato");
    expect(normalizeIngredientName("TOMATO")).toBe("tomato");
    expect(normalizeIngredientName("Tomatoes")).toBe("tomato");
    expect(normalizeIngredientName("tomatoes")).toBe("tomato");
  });

  it("strips punctuation and extra whitespace", () => {
    expect(normalizeIngredientName("  Tomatoes, ")).toBe("tomato");
    expect(normalizeIngredientName("olive oil")).toBe("olive oil");
    expect(normalizeIngredientName("olive-oil")).toBe("olive oil");
  });

  it("handles common plural shapes", () => {
    expect(normalizeIngredientName("Potatoes")).toBe("potato");
    expect(normalizeIngredientName("Berries")).toBe("berry");
    expect(normalizeIngredientName("Boxes")).toBe("box");
    expect(normalizeIngredientName("Cheese")).toBe("cheese");
    expect(normalizeIngredientName("Glass")).toBe("glass");
  });

  it("returns empty string for junk input", () => {
    expect(normalizeIngredientName("")).toBe("");
    expect(normalizeIngredientName("   ")).toBe("");
    expect(normalizeIngredientName("!!!")).toBe("");
  });
});

describe("singularize", () => {
  it("keeps short words", () => {
    expect(singularize("egg")).toBe("egg");
    expect(singularize("milk")).toBe("milk");
  });
  it("strips -s", () => {
    expect(singularize("apples")).toBe("apple");
  });
});

describe("normalizeUnit / unitsCompatible", () => {
  it("canonicalizes unit spellings", () => {
    expect(normalizeUnit("g")).toBe("gram");
    expect(normalizeUnit("Grams")).toBe("gram");
    expect(normalizeUnit("tbsp")).toBe("tablespoon");
    expect(normalizeUnit("pieces")).toBe("piece");
    expect(normalizeUnit("")).toBe(null);
    expect(normalizeUnit(null)).toBe(null);
  });

  it("merges compatible units only", () => {
    expect(unitsCompatible("g", "grams")).toBe(true);
    expect(unitsCompatible("pieces", "piece")).toBe(true);
    expect(unitsCompatible("cups", "g")).toBe(false);
    expect(unitsCompatible("g", null)).toBe(false);
    expect(unitsCompatible(null, "g")).toBe(false);
  });
});

describe("displayIngredientName", () => {
  it("title-cases the first letter and collapses whitespace", () => {
    expect(displayIngredientName("  tomato")).toBe("Tomato");
    expect(displayIngredientName("basmati   rice")).toBe("Basmati rice");
  });
});

describe("mergeIngredients", () => {
  it("sums compatible duplicates (2 tomatoes + 3 tomatoes = 5 tomatoes)", () => {
    const out = mergeIngredients([
      { name: "Tomatoes", quantity: 2, unit: "pieces" },
      { name: "tomato", quantity: 3, unit: "pieces" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Tomatoes"); // display name taken from the first input
    expect(out[0].quantity).toBe(5);
    expect(out[0].normalized_name).toBe("tomato");
    expect(out[0].sources).toBe(2);
  });

  it("never merges incompatible units", () => {
    const out = mergeIngredients([
      { name: "Milk", quantity: 1, unit: "cups" },
      { name: "milk", quantity: 200, unit: "g" },
    ]);
    expect(out).toHaveLength(2);
    // quantities are not summed across units
    const qtys = out.map((i) => i.quantity).sort();
    expect(qtys).toEqual([1, 200]);
  });

  it("keeps quantity null when any source in the same unit group is unknown", () => {
    const out = mergeIngredients([
      { name: "Eggs", quantity: 4, unit: "pieces" },
      { name: "egg", quantity: null, unit: "pieces" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(null);
  });

  it("splits unknown-unit items from known-unit items", () => {
    const out = mergeIngredients([
      { name: "Eggs", quantity: 4, unit: "pieces" },
      { name: "egg", quantity: null, unit: null },
    ]);
    expect(out).toHaveLength(2);
  });

  it("dedupes distinct names", () => {
    const out = mergeIngredients([
      { name: "Rice", quantity: null, unit: null },
      { name: "Onion", quantity: 2, unit: "pieces" },
      { name: "rice", quantity: null, unit: null },
    ]);
    expect(out).toHaveLength(2);
  });
});
