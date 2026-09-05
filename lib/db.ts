import { createClient } from "./supabase/server";
import type {
  PantryItem,
  Recipe,
  RecipeRow,
  GroceryListRow,
  GroceryItemRow,
  Ingredient,
} from "./types";

/** Server-only data access. Every query is scoped to the authenticated user. */

export async function getUserPantry(userId: string): Promise<PantryItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .select("*")
    .eq("user_id", userId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PantryItem[];
}

export async function upsertPantryItems(
  userId: string,
  items: Omit<PantryItem, "id" | "user_id" | "created_at" | "updated_at">[],
): Promise<void> {
  const supabase = createClient();
  if (items.length === 0) return;
  const rows = items.map((i) => ({ ...i, user_id: userId }));
  const { error } = await supabase.from("pantry_items").upsert(rows, {
    onConflict: "user_id,normalized_name",
  });
  if (error) throw new Error(error.message);
}

export async function updatePantryItem(id: string, patch: Partial<PantryItem>): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("pantry_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePantryItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("pantry_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createScan(
  userId: string,
  imageUrl: string | null,
  detected: Ingredient[],
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("scans").insert({
    user_id: userId,
    image_url: imageUrl,
    detected_data: detected,
  });
  if (error) throw new Error(error.message);
}

export async function getRecipes(userId: string): Promise<{ id: string; recipe: Recipe }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: RecipeRow) => ({ id: r.id, recipe: r.recipe_data as Recipe }));
}

export async function getRecipe(userId: string, id: string): Promise<{ id: string; recipe: Recipe } | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (error) return null;
  return { id: (data as RecipeRow).id, recipe: (data as RecipeRow).recipe_data as Recipe };
}

export async function saveRecipe(
  userId: string,
  title: string,
  description: string | null,
  recipe: Recipe,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ user_id: userId, title, description, recipe_data: recipe })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Fetch-or-create the user's default grocery list. */
export async function getDefaultGroceryList(userId: string): Promise<GroceryListRow> {
  const supabase = createClient();
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
  if (error) throw new Error(error.message);
  return created as GroceryListRow;
}

export async function getGroceryItems(listId: string): Promise<GroceryItemRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("grocery_list_id", listId)
    .order("completed")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as GroceryItemRow[];
}

type GroceryItemInput = Omit<GroceryItemRow, "id" | "grocery_list_id" | "created_at" | "completed"> & {
  completed?: boolean;
};

export async function upsertGroceryItems(
  listId: string,
  items: GroceryItemInput[],
): Promise<void> {
  const supabase = createClient();
  if (items.length === 0) return;
  const rows = items.map((i) => ({
    ...i,
    grocery_list_id: listId,
    completed: i.completed ?? false,
  }));
  const { error } = await supabase.from("grocery_items").insert(rows);
  if (error) throw new Error(error.message);
}

export async function setGroceryItemComplete(itemId: string, completed: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("grocery_items").update({ completed }).eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function deleteGroceryItem(itemId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("grocery_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function clearCompletedGroceryItems(listId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("grocery_list_id", listId)
    .eq("completed", true);
  if (error) throw new Error(error.message);
}
