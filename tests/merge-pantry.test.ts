import { describe, it, expect } from "vitest";
import { mergeWithPantry, selectChangedGroceryItems, mergeIngredients } from "../lib/ingredients";

describe("mergeWithPantry (KI-2: rescan accumulates instead of overwriting)", () => {
  it("sums compatible-unit quantities across scans (2 + 1 = 3)", () => {
    const existing = [{ name: "Tomatoes", quantity: 2, unit: "pieces" }];
    const incoming = [{ name: "tomato", quantity: 1, unit: "pieces" }];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    expect(out[0].normalized_name).toBe("tomato");
    expect(out[0].unit).toBe("pieces"); // existing display unit wins
  });

  it("keeps a known quantity when the incoming detection has none", () => {
    const existing = [{ name: "Milk", quantity: 2, unit: "cups" }];
    const incoming = [{ name: "milk", quantity: null, unit: null }];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(2); // not zeroed by an unknown rescan
  });

  it("takes the known quantity when existing is unknown", () => {
    const existing = [{ name: "Rice", quantity: null, unit: null }];
    const incoming = [{ name: "rice", quantity: 500, unit: "g" }];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(500);
  });

  it("overwrites when units are incompatible (never cup + g)", () => {
    const existing = [{ name: "Milk", quantity: 2, unit: "cups" }];
    const incoming = [{ name: "milk", quantity: 200, unit: "g" }];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(200);
    expect(out[0].unit).toBe("g");
  });

  it("keeps untouched pantry items as-is", () => {
    const existing = [
      { name: "Bread", quantity: 2, unit: "slices" },
      { name: "Tomatoes", quantity: 2, unit: "pieces" },
    ];
    const incoming = [{ name: "tomato", quantity: 1, unit: "pieces" }];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(2);
    const bread = out.find((i) => i.normalized_name === "bread");
    expect(bread?.quantity).toBe(2);
    expect(bread?.unit).toBe("slices");
  });

  it("adds new items with their own quantity", () => {
    const out = mergeWithPantry([], [{ name: "Eggs", quantity: 6, unit: "pieces" }]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(6);
  });

  it("collapses multiple incompatible-unit rows of one name into one (pantry allows one row per name)", () => {
    const existing = [{ name: "Milk", quantity: 2, unit: "cups" }];
    const incoming = [
      { name: "milk", quantity: 1, unit: "cups" },
      { name: "milk", quantity: 200, unit: "g" },
    ];
    const out = mergeWithPantry(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0].normalized_name).toBe("milk");
  });
});

describe("selectChangedGroceryItems (KI-1: only changed rows are written)", () => {
  const current = [
    { normalized_name: "bread", unit: "loaf", quantity: 1 },
    { normalized_name: "milk", unit: "cups", quantity: 2 },
    { normalized_name: "salt", unit: null, quantity: null },
  ];

  it("returns nothing when the merged result is identical (purchased items stay untouched)", () => {
    const merged = mergeIngredients([
      { name: "Bread", quantity: 1, unit: "loaf" },
      { name: "Milk", quantity: 2, unit: "cups" },
      { name: "Salt", quantity: null, unit: null },
    ]);
    expect(selectChangedGroceryItems(current, merged)).toHaveLength(0);
  });

  it("returns only the rows whose quantity changed", () => {
    const merged = mergeIngredients([
      ...current.map((c) => ({ name: c.normalized_name, quantity: c.quantity, unit: c.unit })),
      { name: "milk", quantity: 1, unit: "cups" }, // 2 + 1 = 3
      { name: "eggs", quantity: 6, unit: "pieces" }, // new
    ]);
    const changed = selectChangedGroceryItems(current, merged);
    const names = changed.map((c) => c.normalized_name).sort();
    expect(names).toEqual(["egg", "milk"]); // "eggs" normalizes to "egg"
    const milk = changed.find((c) => c.normalized_name === "milk");
    expect(milk?.quantity).toBe(3);
  });

  it("keeps the unit-less row and adds a new unit-specific row", () => {
    const base = [{ normalized_name: "salt", unit: null, quantity: null }];
    const toKnown = mergeIngredients([
      { name: "Salt", quantity: null, unit: null },
      { name: "salt", quantity: 300, unit: "g" },
    ]);
    // (salt, null-unit) is unchanged → skipped; (salt, g) is a new key → written.
    const out = selectChangedGroceryItems(base, toKnown);
    expect(out).toHaveLength(1);
    expect(out[0].unit).toBe("g");
    expect(out[0].quantity).toBe(300);
  });

  it("re-adding the same quantity of a purchased item is a no-op", () => {
    const merged = mergeIngredients([
      { name: "Bread", quantity: 1, unit: "loaf" },
      { name: "bread", quantity: 1, unit: "loaf" }, // user re-adds 1 loaf
    ]);
    // merged bread = 2 loaves ≠ stored 1 → it IS changed (correct: new need)
    const out = selectChangedGroceryItems(current, merged);
    expect(out).toHaveLength(1);
    expect(out[0].normalized_name).toBe("bread");
    expect(out[0].quantity).toBe(2);
  });
});
