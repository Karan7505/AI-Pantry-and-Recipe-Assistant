/**
 * Integration tests (blueprint P2): server actions + lib/db against an
 * in-memory Supabase (tests/integration/supabase-mock.ts), faithful to the
 * real query chains and the 0002/0003 conflict keys. No network, no DB.
 *
 * Acceptance criteria covered:
 *  - KI-2: two scans of the same item accumulate (2 + 1 → 3)
 *  - KI-1: re-adding grocery items never duplicates rows; quantities sum;
 *          untouched purchased items keep their completed state
 *  - KI-7: malformed recipes.recipe_data degrades to "not found"
 *  - H-4:  query-level user scoping (defense in depth under RLS)
 *  - P1:   error hygiene — no driver/auth text crosses the action boundary
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => state.client,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { MockSupabase, type Row } from "./supabase-mock";
import {
  addPantryItem,
  confirmPantryItems,
  addMissingToGrocery,
  toggleGroceryItem,
  saveRecipeAction,
} from "../../lib/actions-data";
import { getRecipe, getRecipes, getUserPantry } from "../../lib/db";
import type { Recipe } from "../../lib/types";

let db: MockSupabase;
let uid: string;
const nowIso = () => new Date().toISOString();

beforeEach(() => {
  uid = `uid-${randomUUID()}`;
  db = new MockSupabase(uid);
  state.client = db;
});

function pantryRow(overrides: Partial<Row> = {}): Row {
  return {
    id: randomUUID(),
    user_id: uid,
    name: "Item",
    normalized_name: "item",
    quantity: 1,
    unit: null,
    category: null,
    expiration_date: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...overrides,
  };
}

function validRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    title: "Tomato Basil Pasta",
    description: "Quick pasta.",
    mealType: "dinner",
    cuisine: "Italian",
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 2,
    ingredients: [
      { name: "Tomatoes", quantity: 3, unit: "piece", available: true, normalized_name: "tomato" },
      { name: "Basil", quantity: 1, unit: "bunch", available: false, normalized_name: "basil" },
    ],
    ingredientsAvailable: ["Tomatoes"],
    ingredientsMissing: ["Basil"],
    instructions: ["Boil the pasta.", "Mix with sauce."],
    nutrition: { calories: 450, proteinGrams: 12, carbsGrams: 60, fatGrams: 14 },
    matchScore: 50,
    ...overrides,
  };
}

// ── KI-2: pantry rescan accumulation ─────────────────────────────────────────

describe("pantry rescan accumulation (KI-2)", () => {
  it("two scans of the same item sum quantities instead of overwriting (2 + 1 → 3)", async () => {
    expect((await confirmPantryItems([{ name: "Tomatoes", quantity: 2, unit: "pieces", category: "vegetable" }])).ok).toBe(true);
    expect((await confirmPantryItems([{ name: "Tomato", quantity: 1, unit: "piece", category: "vegetable" }])).ok).toBe(true);

    const rows = db.tables.pantry_items.filter((r) => r.user_id === uid);
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized_name).toBe("tomato");
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].unit).toBe("pieces");
  });

  it("keeps the known quantity when the rescan has none", async () => {
    await confirmPantryItems([{ name: "Milk", quantity: 2, unit: "cup", category: "dairy" }]);
    await confirmPantryItems([{ name: "Milk", quantity: null, unit: null }]);

    const row = db.tables.pantry_items.find((r) => r.normalized_name === "milk")!;
    expect(row.quantity).toBe(2);
    expect(row.unit).toBe("cup");
  });

  it("overwrites when the units are incompatible (cup vs ml)", async () => {
    await confirmPantryItems([{ name: "Milk", quantity: 2, unit: "cup", category: "dairy" }]);
    await confirmPantryItems([{ name: "Milk", quantity: 500, unit: "ml" }]);

    const rows = db.tables.pantry_items.filter((r) => r.normalized_name === "milk");
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(500);
    expect(rows[0].unit).toBe("ml");
  });
});

// ── KI-1: grocery list integrity ─────────────────────────────────────────────

describe("grocery list integrity (KI-1)", () => {
  it("adds the same item twice: one row, quantities summed", async () => {
    expect((await addMissingToGrocery([{ name: "Flour", quantity: 500, unit: "g" }], "Pancakes")).ok).toBe(true);
    expect((await addMissingToGrocery([{ name: "Flour", quantity: 300, unit: "g" }], "Pie")).ok).toBe(true);

    const list = db.tables.grocery_lists.find((r) => r.user_id === uid)!;
    const items = db.tables.grocery_items.filter((r) => r.grocery_list_id === list.id);
    expect(items).toHaveLength(1);
    expect(items[0].normalized_name).toBe("flour");
    expect(items[0].quantity).toBe(800);
  });

  it("preserves completed state of untouched items when new items are added", async () => {
    await addMissingToGrocery(
      [
        { name: "Flour", quantity: 500, unit: "g" },
        { name: "Milk", quantity: 1, unit: "cup" },
      ],
      "Pancakes",
    );
    const list = db.tables.grocery_lists.find((r) => r.user_id === uid)!;
    const milk = db.tables.grocery_items.find((r) => r.normalized_name === "milk")!;

    expect((await toggleGroceryItem(milk.id as string, true)).ok).toBe(true);
    expect(db.tables.grocery_items.find((r) => r.id === milk.id)!.completed).toBe(true);

    await addMissingToGrocery([{ name: "Sugar", quantity: 2, unit: "tbsp" }], "Cake");

    const items = db.tables.grocery_items.filter((r) => r.grocery_list_id === list.id);
    expect(items).toHaveLength(3); // flour, milk, sugar — no duplicates
    const milkAfter = items.find((r) => r.id === milk.id)!;
    expect(milkAfter.completed).toBe(true); // untouched purchased item
    expect(milkAfter.quantity).toBe(1);
  });
});

// ── KI-7: recipe JSONB validated on read ─────────────────────────────────────

describe("recipe JSONB validated on read (KI-7)", () => {
  it("returns null for a malformed recipe_data row (404 path)", async () => {
    const id = randomUUID();
    db.tables.recipes.push({
      id,
      user_id: uid,
      title: "Corrupt",
      description: null,
      recipe_data: { title: 42 }, // deliberately invalid
      created_at: nowIso(),
    });
    expect(await getRecipe(uid, id)).toBeNull();
    expect(await getRecipes(uid)).toHaveLength(0);
  });

  it("round-trips a valid saved recipe, keeping availability flags", async () => {
    const res = await saveRecipeAction(validRecipe());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const loaded = await getRecipe(uid, res.value);
    expect(loaded).not.toBeNull();
    expect(loaded!.recipe.title).toBe("Tomato Basil Pasta");
    expect(loaded!.recipe.ingredients[0].available).toBe(true);
    expect(loaded!.recipe.matchScore).toBe(50);
  });

  it("rejects a malformed recipe at save time with the known message", async () => {
    const res = await saveRecipeAction(validRecipe({ ingredients: [] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid request.");
    expect(db.tables.recipes).toHaveLength(0);
  });
});

// ── Grocery generation respects the pantry ───────────────────────────────────

describe("grocery generation respects the pantry", () => {
  it("never adds an ingredient the user already has", async () => {
    db.tables.pantry_items.push(pantryRow({ name: "Tomatoes", normalized_name: "tomato", unit: "piece" }));

    expect(
      (
        await addMissingToGrocery(
          [
            { name: "Tomato", quantity: 3, unit: "piece" },
            { name: "Basil", quantity: 1, unit: "bunch" },
          ],
          "Pasta",
        )
      ).ok,
    ).toBe(true);

    expect(db.tables.grocery_items).toHaveLength(1);
    expect(db.tables.grocery_items[0].normalized_name).toBe("basil");
  });
});

// ── Security & error hygiene regressions ─────────────────────────────────────

describe("security & error hygiene regressions", () => {
  it("query-level scoping: another user's rows are never returned", async () => {
    const other = `uid-${randomUUID()}`;
    db.tables.pantry_items.push(pantryRow({ user_id: other, name: "Secret", normalized_name: "secret" }));
    db.tables.pantry_items.push(pantryRow({ name: "Mine", normalized_name: "mine" }));

    const mine = await getUserPantry(uid);
    expect(mine).toHaveLength(1);
    expect(mine[0].normalized_name).toBe("mine");
  });

  it("surfaces the user-safe DB error, never the driver message", async () => {
    db.failWith = { message: "injected: disk full at /var/lib/postgresql/14/main" };
    const res = await addPantryItem({ name: "Rice", quantity: 1, unit: "kg", category: "grain" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("A database operation failed. Please try again.");
      expect(res.error).not.toContain("injected");
    }
  });

  it("unauthenticated actions get a generic failure, not the raw auth error", async () => {
    db.uid = null;
    const res = await addPantryItem({ name: "Rice", quantity: 1, unit: "kg" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Something went wrong. Please try again.");
  });

  it("invalid input returns the known 'Invalid request.' message", async () => {
    const res = await addPantryItem({ name: "", quantity: 1, unit: "kg" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid request.");
  });

  it("rate-limits repeated scan confirmations within the hour", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await confirmPantryItems([{ name: "Eggs", quantity: 1, unit: "piece", category: "egg" }]);
      if (i < 29) expect(res.ok).toBe(true);
    }
    const res = await confirmPantryItems([{ name: "Eggs", quantity: 1, unit: "piece", category: "egg" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Too many requests. Please slow down.");
  });
});
