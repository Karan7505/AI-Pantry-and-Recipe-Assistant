"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import {
  getUserPantry,
  upsertPantryItems,
  updatePantryItem,
  deletePantryItem,
  createScan,
  saveRecipe,
  getDefaultGroceryList,
  getGroceryItems,
  upsertGroceryItems,
  setGroceryItemComplete,
  deleteGroceryItem,
  clearCompletedGroceryItems,
} from "./db";
import { normalizeIngredientName, mergeIngredients } from "./ingredients";
import type { Category, Recipe, GroceryItemRow } from "./types";

async function requireUid(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

function refresh(path = "/") {
  revalidatePath(path);
  revalidatePath("/dashboard");
}

// ── Pantry ───────────────────────────────────────────────────────────────────

export interface PantryInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: Category | null;
  expiration_date: string | null;
}

export async function addPantryItem(input: PantryInput): Promise<void> {
  const uid = await requireUid();
  const normalized = normalizeIngredientName(input.name);
  if (!normalized) return;
  await upsertPantryItems(uid, [
    {
      name: input.name.trim(),
      normalized_name: normalized,
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      expiration_date: input.expiration_date,
    },
  ]);
  refresh("/pantry");
}

export async function updatePantryAction(id: string, input: PantryInput): Promise<void> {
  const uid = await requireUid();
  const normalized = normalizeIngredientName(input.name) || normalizeIngredientName(id);
  const existing = (await getUserPantry(uid)).find((p) => p.id === id);
  await updatePantryItem(id, {
    name: input.name.trim(),
    normalized_name: normalized || existing?.normalized_name,
    quantity: input.quantity,
    unit: input.unit,
    category: input.category,
    expiration_date: input.expiration_date,
  });
  refresh("/pantry");
}

export async function adjustPantryQuantity(id: string, delta: number): Promise<void> {
  const uid = await requireUid();
  const items = await getUserPantry(uid);
  const item = items.find((p) => p.id === id);
  if (!item) return;
  const next = Math.max(0, (item.quantity ?? 0) + delta);
  await updatePantryItem(id, { quantity: item.quantity == null ? (delta > 0 ? 1 : null) : next });
  refresh("/pantry");
}

export async function deletePantryAction(id: string): Promise<void> {
  await requireUid();
  await deletePantryItem(id);
  refresh("/pantry");
}

/** Merge a set of detected/entered ingredients into the pantry (dedupe by normalized name). */
export async function confirmPantryItems(items: {
  name: string;
  quantity: number | null;
  unit: string | null;
  category?: Category | null;
  image_url?: string | null;
}[]): Promise<void> {
  const uid = await requireUid();
  const merged = mergeIngredients(
    items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
  );
  await upsertPantryItems(
    uid,
    merged.map((m) => ({
      name: m.name,
      normalized_name: m.normalized_name,
      quantity: m.quantity,
      unit: m.unit,
      category: (items.find((i) => normalizeIngredientName(i.name) === m.normalized_name)?.category ??
        null) as Category | null,
      expiration_date: null,
    })),
  );
  if (items.some((i) => i.image_url)) {
    await createScan(uid, items[0]?.image_url ?? null, items);
  }
  refresh("/pantry");
}

// ── Recipes ──────────────────────────────────────────────────────────────────

export async function saveRecipeAction(recipe: Recipe): Promise<string> {
  const uid = await requireUid();
  const id = await saveRecipe(uid, recipe.title, recipe.description, recipe);
  refresh("/dashboard");
  return id;
}

// ── Grocery ──────────────────────────────────────────────────────────────────

export async function addMissingToGrocery(
  items: { name: string; quantity: number | null; unit: string | null }[],
  sourceRecipeTitle: string,
): Promise<void> {
  const uid = await requireUid();
  const list = await getDefaultGroceryList(uid);
  if (!items.length) return;
  // Only add items not already in the list (matched by normalized name + unit).
  const existing = await getGroceryItems(list.id);
  const existingKeys = new Set(
    existing.map((e) => `${normalizeIngredientName(e.name)}|${(e.unit ?? "").toLowerCase()}`),
  );
  const toAdd = items.filter(
    (i) => !existingKeys.has(`${normalizeIngredientName(i.name)}|${(i.unit ?? "").toLowerCase()}`),
  );
  const rows = toAdd.map((i) => ({
    name: i.name,
    normalized_name: normalizeIngredientName(i.name) || i.name,
    quantity: i.quantity,
    unit: i.unit,
    source_recipe_title: sourceRecipeTitle,
  }));
  await upsertGroceryItems(list.id, rows);
  refresh("/grocery");
}

export async function addCustomGroceryItem(input: {
  name: string;
  quantity: number | null;
  unit: string | null;
}): Promise<void> {
  const uid = await requireUid();
  const list = await getDefaultGroceryList(uid);
  await upsertGroceryItems(list.id, [
    {
      name: input.name,
      normalized_name: normalizeIngredientName(input.name) || input.name,
      quantity: input.quantity,
      unit: input.unit,
      source_recipe_title: null,
    },
  ]);
  refresh("/grocery");
}

export async function toggleGroceryItem(id: string, completed: boolean): Promise<void> {
  await requireUid();
  await setGroceryItemComplete(id, completed);
  refresh("/grocery");
}

export async function removeGroceryItem(id: string): Promise<void> {
  await requireUid();
  await deleteGroceryItem(id);
  refresh("/grocery");
}

export async function clearPurchasedGrocery(): Promise<void> {
  const uid = await requireUid();
  const list = await getDefaultGroceryList(uid);
  await clearCompletedGroceryItems(list.id);
  refresh("/grocery");
}

export type { GroceryItemRow };
