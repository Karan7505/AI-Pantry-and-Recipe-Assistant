import { createClient } from "./supabase/server";
import type {
  PantryItem,
  Recipe,
  RecipeRow,
  GroceryListRow,
  GroceryItemRow,
  Ingredient,
} from "./types";

/**
 * Server-only data access.
 * Defense in depth: every query is scoped to the authenticated user at the
 * query level IN ADDITION TO Supabase RLS, so cross-user access fails even if
 * a policy were ever misconfigured.
 */

/** User-safe error; details go to server logs only. */
function dbError(label: string, error: { message: string }): never {
  console.error(`[db:${label}]`, error.message);
  throw new Error("A database operation failed. Please try again.");
}

/** Whitelisted columns a client may patch on a pantry item. */
const PANTRY_PATCH_COLUMNS = ["name", "normalized_name", "quantity", "unit", "category", "expiration_date"] as const;
type PantryPatch = Partial<Pick<PantryItem, (typeof PANTRY_PATCH_COLUMNS)[number]>>;

export async function getUserPantry(userId: string): Promise<PantryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .select("*")
    .eq("user_id", userId)
    .order("name");
  if (error) dbError("getUserPantry", error);
  return (data ?? []) as PantryItem[];
}

export async function upsertPantryItems(
  userId: string,
  items: Omit<PantryItem, "id" | "user_id" | "created_at" | "updated_at">[],
): Promise<void> {
  const supabase = await createClient();
  if (items.length === 0) return;
  const rows = items.map((i) => ({ ...i, user_id: userId }));
  const { error } = await supabase.from("pantry_items").upsert(rows, {
    onConflict: "user_id,normalized_name",
  });
  if (error) dbError("upsertPantryItems", error);
}

export async function updatePantryItem(userId: string, id: string, patch: PantryPatch): Promise<void> {
  const safe: Record<string, unknown> = {};
  for (const key of PANTRY_PATCH_COLUMNS) {
    if (key in patch) safe[key] = patch[key];
  }
  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").update(safe).eq("id", id).eq("user_id", userId);
  if (error) dbError("updatePantryItem", error);
}

export async function deletePantryItem(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").delete().eq("id", id).eq("user_id", userId);
  if (error) dbError("deletePantryItem", error);
}

export async function createScan(
  userId: string,
  imageUrl: string | null,
  detected: Ingredient[],
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("scans").insert({
    user_id: userId,
    image_url: imageUrl,
    detected_data: detected,
  });
  if (error) dbError("createScan", error);
}

export async function getRecipes(userId: string): Promise<{ id: string; recipe: Recipe }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) dbError("getRecipes", error);
  return (data ?? []).map((r: RecipeRow) => ({ id: r.id, recipe: r.recipe_data as Recipe }));
}

export async function getRecipe(userId: string, id: string): Promise<{ id: string; recipe: Recipe } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (error) return null; // 404/RLS → treat as "not yours"
  return { id: (data as RecipeRow).id, recipe: (data as RecipeRow).recipe_data as Recipe };
}

export async function saveRecipe(
  userId: string,
  title: string,
  description: string | null,
  recipe: Recipe,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ user_id: userId, title, description, recipe_data: recipe })
    .select("id")
    .single();
  if (error) dbError("saveRecipe", error);
  return (data as { id: string }).id;
}

/** Fetch-or-create the user's default grocery list. */
export async function getDefaultGroceryList(userId: string): Promise<GroceryListRow> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as GroceryListRow;

  const { data: created, error } = await supabase
    .from("grocery_lists")
    .insert({ user_id: userId, name: "My grocery list" })
    .select("*")
    .single();
  if (error) dbError("getDefaultGroceryList", error);
  return created as GroceryListRow;
}

export async function getGroceryItems(listId: string): Promise<GroceryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("grocery_list_id", listId)
    .order("completed")
    .order("name");
  if (error) dbError("getGroceryItems", error);
  return (data ?? []) as GroceryItemRow[];
}

type GroceryItemInput = Omit<GroceryItemRow, "id" | "grocery_list_id" | "created_at" | "completed"> & {
  completed?: boolean;
};

export async function upsertGroceryItems(
  listId: string,
  items: GroceryItemInput[],
): Promise<void> {
  const supabase = await createClient();
  if (items.length === 0) return;
  const rows = items.map((i) => ({
    ...i,
    grocery_list_id: listId,
    completed: i.completed ?? false,
  }));
  const { error } = await supabase.from("grocery_items").insert(rows);
  if (error) dbError("upsertGroceryItems", error);
}

/** Scoped to an owned list id — call sites must resolve the list via the user. */
export async function setGroceryItemComplete(listId: string, itemId: string, completed: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_items")
    .update({ completed })
    .eq("id", itemId)
    .eq("grocery_list_id", listId);
  if (error) dbError("setGroceryItemComplete", error);
}

/** Scoped to an owned list id — call sites must resolve the list via the user. */
export async function deleteGroceryItem(listId: string, itemId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("id", itemId)
    .eq("grocery_list_id", listId);
  if (error) dbError("deleteGroceryItem", error);
}

export async function clearCompletedGroceryItems(listId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("grocery_list_id", listId)
    .eq("completed", true);
  if (error) dbError("clearCompletedGroceryItems", error);
}
