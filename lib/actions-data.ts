"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUid } from "./auth";
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
import { rateLimit } from "./ratelimit";
import { CATEGORIES, type Category, type Recipe } from "./types";

/** Every data action re-verifies the session server-side (audit H-4). */
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

export async function addPantryItem(input: PantryInput): Promise<void> {
  const uid = await requireUser();
  const parsed = pantryInputSchema.safeParse(input);
  if (!parsed.success) badRequest();
  const { name, quantity, unit, category, expirationDate } = parsed.data;
  await upsertPantryItems(uid, [
    { name, normalized_name: normalizeIngredientName(name), quantity, unit, category: category ?? null, expiration_date: expirationDate ?? null },
  ]);
  revalidatePath("/pantry");
  revalidatePath("/dashboard");
}

export async function updatePantryAction(id: string, patch: Partial<PantryInput>): Promise<void> {
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
}

export async function adjustPantryQuantity(id: string, delta: number): Promise<void> {
  const uid = await requireUser();
  const items = await getUserPantry(uid);
  const item = items.find((i) => i.id === id);
  if (!item) return;
  const next = Math.max(0, (item.quantity ?? 0) + delta);
  await updatePantryItem(uid, id, { quantity: next || null });
  revalidatePath("/pantry");
}

export async function deletePantryAction(id: string): Promise<void> {
  const uid = await requireUser();
  await deletePantryItem(uid, id);
  revalidatePath("/pantry");
  revalidatePath("/dashboard");
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

export async function confirmPantryItems(
  items: ConfirmedItem[],
  imageUrl: string | null = null,
): Promise<void> {
  const uid = await requireUser();
  const parsed = confirmedItemsSchema.safeParse(items);
  if (!parsed.success) badRequest();
  if (!(await rateLimit(uid, "pantry-confirm", 30))) throw new Error("Too many requests. Please slow down.");

  const merged = mergeIngredients(parsed.data);
  const rows = merged.map((i) => ({
    name: i.name,
    normalized_name: normalizeIngredientName(i.name),
    quantity: i.quantity,
    unit: i.unit,
    category: (i as { category?: Category }).category ?? null,
    expiration_date: null,
  }));
  await upsertPantryItems(uid, rows);
  await createScan(uid, imageUrl, parsed.data).catch((e) =>
    console.error("[scan:record]", (e as Error).message),
  );
  revalidatePath("/pantry");
  revalidatePath("/dashboard");
}

// ── Recipes ───────────────────────────────────────────────────────────────────
const persistableRecipeSchema = z.object({
  title: z.string().min(1).max(140),
  description: z.string().max(2000).nullable(),
  mealType: z.string().max(30).nullable(),
  cuisine: z.string().max(60).nullable(),
  prepTimeMinutes: z.number().int().min(0).max(10_000),
  cookTimeMinutes: z.number().int().min(0).max(10_000),
  servings: z.number().int().min(1).max(1000),
  ingredients: z
    .array(z.object({ name: z.string().min(1).max(120), quantity: z.number().positive().max(1_000_000).nullable(), unit: z.string().max(40).nullable() }))
    .min(1)
    .max(100),
  ingredientsAvailable: z.array(z.string().max(120)).max(100),
  ingredientsMissing: z.array(z.string().max(120)).max(100),
  instructions: z.array(z.string().min(1).max(4000)).min(1).max(60),
  nutrition: z.object({
    calories: z.number().min(0).max(100_000),
    proteinGrams: z.number().min(0).max(10_000),
    carbsGrams: z.number().min(0).max(10_000),
    fatGrams: z.number().min(0).max(10_000),
    fiberGrams: z.number().min(0).max(10_000).optional(),
    sugarGrams: z.number().min(0).max(10_000).optional(),
    sodiumMilligrams: z.number().min(0).max(1_000_000).optional(),
    saturatedFatGrams: z.number().min(0).max(10_000).optional(),
  }),
  matchScore: z.number().min(0).max(100),
});

export async function saveRecipeAction(recipe: Recipe): Promise<string> {
  const uid = await requireUser();
  const parsed = persistableRecipeSchema.safeParse(recipe);
  if (!parsed.success) badRequest();
  if (!(await rateLimit(uid, "save-recipe", 60))) throw new Error("Too many requests. Please slow down.");
  const id = await saveRecipe(uid, parsed.data.title, parsed.data.description, parsed.data as Recipe);
  revalidatePath("/dashboard");
  return id;
}

export interface MissingIngredient {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export async function addMissingToGrocery(items: MissingIngredient[], recipeTitle: string): Promise<void> {
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
  await upsertGroceryItems(list.id, merged.map((m) => ({
    name: m.name,
    normalized_name: normalizeIngredientName(m.name),
    quantity: m.quantity,
    unit: m.unit,
    source_recipe_title: recipeTitle.slice(0, 140),
  })));
  revalidatePath("/grocery");
}

function toMergeInput(i: { name: string; quantity: number | null; unit: string | null; normalized_name?: string; source_recipe_title?: string | null }) {
  return { name: i.name, quantity: i.quantity, unit: i.unit };
}

export async function addCustomGroceryItem(input: {
  name: string;
  quantity: number | null;
  unit: string | null;
}): Promise<void> {
  const uid = await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), quantity: z.number().positive().max(1_000_000).nullable(), unit: z.string().trim().max(40).nullable() })
    .safeParse(input);
  if (!parsed.success) badRequest();
  if (!(await rateLimit(uid, "grocery-add", 60))) throw new Error("Too many requests. Please slow down.");

  const list = await getDefaultGroceryList(uid);
  const current = await getGroceryItems(list.id);
  const merged = mergeIngredients([...current.map(toMergeInput), { name: parsed.data.name, quantity: parsed.data.quantity, unit: parsed.data.unit }]);
  await upsertGroceryItems(list.id, merged.map((m) => ({
    name: m.name,
    normalized_name: normalizeIngredientName(m.name),
    quantity: m.quantity,
    unit: m.unit,
    source_recipe_title: null,
  })));
  revalidatePath("/grocery");
}

// ── Grocery ───────────────────────────────────────────────────────────────────
export async function toggleGroceryItem(id: string, completed: boolean): Promise<void> {
  const uid = await requireUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) badRequest();
  const list = await getDefaultGroceryList(uid);
  await setGroceryItemComplete(list.id, id, completed); // scoped to the owned list
  revalidatePath("/grocery");
}

export async function removeGroceryItem(id: string): Promise<void> {
  const uid = await requireUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) badRequest();
  const list = await getDefaultGroceryList(uid);
  await deleteGroceryItem(list.id, id); // scoped to the owned list
  revalidatePath("/grocery");
}

export async function clearPurchasedGrocery(): Promise<void> {
  const uid = await requireUser();
  const list = await getDefaultGroceryList(uid);
  await clearCompletedGroceryItems(list.id);
  revalidatePath("/grocery");
}
