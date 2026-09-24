"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUid } from "./auth";
import { persistedRecipeSchema } from "./ai/schemas";
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
import { normalizeIngredientName, mergeIngredients, mergeWithPantry, selectChangedGroceryItems } from "./ingredients";
import { rateLimit } from "./ratelimit";
import { runAction, type ActionResult } from "./result";
import { CATEGORIES, type Category, type Recipe } from "./types";

/**
 * Every data action re-verifies the session server-side and returns an
 * ActionResult (blueprint P1): failures never cross the wire as raw throws —
 * the UI renders the user-safe `error` string.
 */
const requireUser = requireUid;

function badRequest(): never {
  throw new Error("Invalid request.");
}

// ── Pantry ────────────────────────────────────────────────────────────────────
const categorySchema = z.enum(CATEGORIES as unknown as [Category, ...Category[]]);

const pantryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().trim().max(40).nullable(),
  category: categorySchema.optional(),
  expirationDate: z.string().max(20).nullable().optional(),
});

type PantryInput = z.infer<typeof pantryInputSchema>;

export async function addPantryItem(input: PantryInput): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const parsed = pantryInputSchema.safeParse(input);
    if (!parsed.success) badRequest();
    const { name, quantity, unit, category, expirationDate } = parsed.data;
    // Adding an existing ingredient accumulates its quantity (blueprint KI-2);
    // the edit modal (updatePantryAction) is the explicit overwrite path.
    const key = normalizeIngredientName(name);
    const existing = await getUserPantry(uid);
    const merged = mergeWithPantry(
      existing.map((e) => ({ name: e.name, quantity: e.quantity, unit: e.unit })),
      [{ name, quantity, unit }],
    );
    const row = merged.find((m) => m.normalized_name === key);
    await upsertPantryItems(uid, [
      {
        name: row?.name ?? name,
        normalized_name: key,
        quantity: row?.quantity ?? null,
        unit: row?.unit ?? unit,
        category: category ?? null,
        expiration_date: expirationDate ?? null,
      },
    ]);
    revalidatePath("/pantry");
    revalidatePath("/dashboard");
  });
}

export async function updatePantryAction(id: string, patch: Partial<PantryInput>): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const parsed = pantryInputSchema.partial().safeParse(patch);
    if (!parsed.success) badRequest();
    const p = parsed.data;
    const existing = await getUserPantry(uid);
    const current = existing.find((i) => i.id === id);
    const name = p.name ?? current?.name ?? "";
    await updatePantryItem(uid, id, {
      name,
      normalized_name: normalizeIngredientName(name),
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      expiration_date: p.expirationDate ?? null,
    });
    revalidatePath("/pantry");
    revalidatePath("/dashboard");
  });
}

export async function adjustPantryQuantity(id: string, delta: number): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const items = await getUserPantry(uid);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const next = Math.max(0, (item.quantity ?? 0) + delta);
    await updatePantryItem(uid, id, { quantity: next || null });
    revalidatePath("/pantry");
  });
}

export async function deletePantryAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    await deletePantryItem(uid, id);
    revalidatePath("/pantry");
    revalidatePath("/dashboard");
  });
}

// ── Scan confirmation ────────────────────────────────────────────────────────
export interface ConfirmedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category?: Category | null;
}

const confirmedItemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      quantity: z.number().positive().max(1_000_000).nullable(),
      unit: z.string().trim().max(40).nullable(),
      category: categorySchema.nullable().optional(),
    }),
  )
  .min(1)
  .max(200);

export async function confirmPantryItems(items: ConfirmedItem[]): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const parsed = confirmedItemsSchema.safeParse(items);
    if (!parsed.success) badRequest();
    if (!(await rateLimit(uid, "pantry-confirm", 30))) throw new Error("Too many requests. Please slow down.");

    // Merge the confirmed batch (intra-scan dedupe) AND into the existing
    // pantry so rescans accumulate instead of overwriting (blueprint KI-2).
    const batch = mergeIngredients(parsed.data);
    const existing = await getUserPantry(uid);
    const merged = mergeWithPantry(
      existing.map((e) => ({ name: e.name, quantity: e.quantity, unit: e.unit })),
      batch.map((b) => ({ name: b.name, quantity: b.quantity, unit: b.unit })),
    );
    // Write only rows that changed, so untouched items keep their category
    // and expiration date (a full re-upsert would null those out).
    const changed = selectChangedGroceryItems(
      existing.map((e) => ({ normalized_name: e.normalized_name, unit: e.unit, quantity: e.quantity })),
      merged,
    );
    const categories = new Map(parsed.data.map((i) => [normalizeIngredientName(i.name), i.category ?? null]));
    const rows = changed.map((i) => ({
      name: i.name,
      normalized_name: i.normalized_name,
      quantity: i.quantity,
      unit: i.unit,
      category: categories.get(i.normalized_name) ?? null,
      expiration_date: null,
    }));
    await upsertPantryItems(uid, rows);
    await createScan(uid, parsed.data).catch((e) =>
      console.error("[scan:record]", (e as Error).message),
    );
    revalidatePath("/pantry");
    revalidatePath("/dashboard");
  });
}

// ── Recipes ───────────────────────────────────────────────────────────────────
export async function saveRecipeAction(recipe: Recipe): Promise<ActionResult<string>> {
  return runAction(async () => {
    const uid = await requireUser();
    // Validate with the shared persisted contract (blueprint KI-7); store the
    // ORIGINAL object (schema parsing would strip the availability flags).
    const parsed = persistedRecipeSchema.safeParse(recipe);
    if (!parsed.success) badRequest();
    if (!(await rateLimit(uid, "save-recipe", 60))) throw new Error("Too many requests. Please slow down.");
    const id = await saveRecipe(uid, parsed.data.title, parsed.data.description, recipe);
    revalidatePath("/dashboard");
    return id;
  });
}

export interface MissingIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export async function addMissingToGrocery(items: MissingIngredient[], recipeTitle: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const parsed = z
      .array(z.object({ name: z.string().trim().min(1).max(120), quantity: z.number().positive().max(1_000_000).nullable(), unit: z.string().trim().max(40).nullable() }))
      .min(1)
      .max(100)
      .safeParse(items);
    if (!parsed.success) badRequest();
    if (!(await rateLimit(uid, "grocery-add", 60))) throw new Error("Too many requests. Please slow down.");

    const pantry = await getUserPantry(uid);
    const pantryKeys = new Set(pantry.map((p) => normalizeIngredientName(p.name)));
    const missing = parsed.data.filter((i) => !pantryKeys.has(normalizeIngredientName(i.name)));
    if (missing.length === 0) return;

    const list = await getDefaultGroceryList(uid);
    const current = await getGroceryItems(list.id);
    const merged = mergeIngredients([...current.map(toMergeInput), ...missing.map(toMergeInput)]);
    // Only write rows that actually changed (blueprint KI-1): a true upsert on
    // (list, normalized_name, unit_key) then merges quantities in the DB and
    // leaves untouched purchased items in their current state.
    const changed = selectChangedGroceryItems(
      current.map((c) => ({ normalized_name: c.normalized_name, unit: c.unit, quantity: c.quantity })),
      merged,
    );
    if (changed.length === 0) return;
    await upsertGroceryItems(list.id, changed.map((m) => ({
      name: m.name,
      normalized_name: normalizeIngredientName(m.name),
      quantity: m.quantity,
      unit: m.unit,
      source_recipe_title: recipeTitle.slice(0, 140),
    })));
    revalidatePath("/grocery");
  });
}

function toMergeInput(i: { name: string; quantity: number | null; unit: string | null; normalized_name?: string; source_recipe_title?: string | null }) {
  return { name: i.name, quantity: i.quantity, unit: i.unit };
}

export async function addCustomGroceryItem(input: {
  name: string;
  quantity: number | null;
  unit: string | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const parsed = z
      .object({ name: z.string().trim().min(1).max(120), quantity: z.number().positive().max(1_000_000).nullable(), unit: z.string().trim().max(40).nullable() })
      .safeParse(input);
    if (!parsed.success) badRequest();
    if (!(await rateLimit(uid, "grocery-add", 60))) throw new Error("Too many requests. Please slow down.");

    const list = await getDefaultGroceryList(uid);
    const current = await getGroceryItems(list.id);
    const merged = mergeIngredients([...current.map(toMergeInput), { name: parsed.data.name, quantity: parsed.data.quantity, unit: parsed.data.unit }]);
    const changed = selectChangedGroceryItems(
      current.map((c) => ({ normalized_name: c.normalized_name, unit: c.unit, quantity: c.quantity })),
      merged,
    );
    if (changed.length === 0) return;
    await upsertGroceryItems(list.id, changed.map((m) => ({
      name: m.name,
      normalized_name: normalizeIngredientName(m.name),
      quantity: m.quantity,
      unit: m.unit,
      source_recipe_title: null,
    })));
    revalidatePath("/grocery");
  });
}

// ── Grocery ───────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function toggleGroceryItem(id: string, completed: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    if (!UUID_RE.test(id)) badRequest();
    const list = await getDefaultGroceryList(uid);
    await setGroceryItemComplete(list.id, id, completed); // scoped to the owned list
    revalidatePath("/grocery");
  });
}

export async function removeGroceryItem(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    if (!UUID_RE.test(id)) badRequest();
    const list = await getDefaultGroceryList(uid);
    await deleteGroceryItem(list.id, id); // scoped to the owned list
    revalidatePath("/grocery");
  });
}

export async function clearPurchasedGrocery(): Promise<ActionResult> {
  return runAction(async () => {
    const uid = await requireUser();
    const list = await getDefaultGroceryList(uid);
    await clearCompletedGroceryItems(list.id);
    revalidatePath("/grocery");
  });
}
