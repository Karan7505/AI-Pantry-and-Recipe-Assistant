// Deterministic ingredient normalization, dedupe, and unit-aware merging.
// Pure & unit-testable — no I/O, no AI.

/** Simple synonym folding for very common produce/pantry items. */
const SYNONYMS: Record<string, string> = {
  eggplant: "aubergine",
  courgette: "zucchini",
  courgettes: "zucchini",
  zucchini: "zucchini",
  yam: "yam",
  "sweet potato": "sweet potato",
  "sweet potatoes": "sweet potato",
  potato: "potato",
  potatoes: "potato",
  tomato: "tomato",
  tomatoes: "tomato",
  onion: "onion",
  onions: "onion",
  garlic: "garlic",
  egg: "egg",
  eggs: "egg",
  milk: "milk",
  water: "water",
  rice: "rice",
  flour: "flour",
  sugar: "sugar",
  salt: "salt",
  "olive oil": "olive oil",
  "olive-oil": "olive oil",
  bread: "bread",
  butter: "butter",
};

/** Singularize a simple English word. Handles the common plural shapes. */
export function singularize(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y"; // berries → berry
  if (/oes$/.test(w)) return w.slice(0, -1); // tomatoes → tomato
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2); // potatoes → potato, boxes → box
  if (/ss$/.test(w)) return w; // glass, cheese → unchanged
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/**
 * Canonical matching key for an ingredient name.
 * "Tomatoes", "TOMATO", "tomato " → "tomato"
 */
export function normalizeIngredientName(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()"'?]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Synonym fold on the multi-word phrase first, then on the singular form.
  if (SYNONYMS[s]) return SYNONYMS[s];
  const singular = singularize(s);
  if (SYNONYMS[singular]) return SYNONYMS[singular];
  return singular;
}

/** Display-friendly name: collapse to a single clean string, title-case-ish. */
export function displayIngredientName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const UNIT_CANON: Record<string, string> = {
  g: "gram", gram: "gram", grams: "gram",
  kg: "kilogram", kilogram: "kilogram", kilograms: "kilogram",
  mg: "milligram", milligram: "milligram", milligrams: "milligram",
  ml: "milliliter", milliliter: "milliliter", milliliters: "milliliter",
  l: "liter", liter: "liter", liters: "liter",
  cup: "cup", cups: "cup",
  tsp: "teaspoon", teaspoon: "teaspoon", teaspoons: "teaspoon",
  tbsp: "tablespoon", tablespoon: "tablespoon", tablespoons: "tablespoon",
  oz: "ounce", ounce: "ounce", ounces: "ounce",
  piece: "piece", pieces: "piece", count: "piece",
  slice: "slice", slices: "slice",
  whole: "whole",
  clove: "clove", cloves: "clove",
};

export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.toLowerCase().trim();
  if (!u) return null;
  return UNIT_CANON[u] ?? singularize(u);
}

/** Two units are compatible only if they canonicalize to the same value (or both null). */
export function unitsCompatible(a: string | null, b: string | null): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  if (na === null || nb === null) return false;
  return na === nb;
}

export interface MergeInput {
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface MergedItem extends MergeInput {
  normalized_name: string;
  sources: number; // how many raw items folded in
}

/**
 * Merge duplicate ingredients where the normalized name matches AND units are
 * compatible. Quantities are summed only when compatible; otherwise the item
 * is kept separate (never incorrectly combine e.g. "1 cup" + "200 g").
 */
export function mergeIngredients(items: MergeInput[]): MergedItem[] {
  type Bucketed = Omit<MergedItem, "sources">;
  const buckets = new Map<string, Bucketed[]>();
  for (const it of items) {
    const key = normalizeIngredientName(it.name);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push({ ...it, name: displayIngredientName(it.name), normalized_name: key });
    buckets.set(key, arr);
  }

  const out: MergedItem[] = [];
  for (const arr of buckets.values()) {
    // Within a name bucket, only merge groups sharing a compatible unit.
    const groups: Bucketed[][] = [];
    for (const item of arr) {
      const unit = normalizeUnit(item.unit);
      const target = groups.find((g) => {
        const gu = normalizeUnit(g[0].unit);
        return unit === null ? gu === null : gu === unit;
      });
      if (target) target.push(item);
      else groups.push([item]);
    }
    for (const g of groups) {
      const allKnown = g.every((x) => x.quantity != null);
      const first = g[0];
      out.push({
        name: first.name,
        normalized_name: first.normalized_name,
        unit: first.unit,
        quantity: allKnown ? g.reduce((sum, x) => sum + (x.quantity ?? 0), 0) : null,
        sources: g.length,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Merge a fresh batch (a confirmed scan or manual add) INTO an existing pantry
 * list, accumulating quantities instead of overwriting them (blueprint KI-2).
 *
 * Rules per normalized name:
 *  - name only in existing  → kept as-is
 *  - name only in incoming  → merged incoming row
 *  - in both, units compatible (either one null, or same canonical unit) →
 *      quantities accumulate: known + known → sum; known + null → keep known;
 *      null + null → null. Unit: the known one (prefers existing).
 *  - in both, units incompatible (both known, e.g. cup vs g) → incoming wins
 *      (overwrite), because combining different units would be wrong
 */
export function mergeWithPantry(existing: MergeInput[], incoming: MergeInput[]): MergedItem[] {
  const batchMerged = mergeIngredients(incoming);
  const existingByName = new Map<string, MergeInput>();
  for (const e of existing) {
    const key = normalizeIngredientName(e.name);
    if (key && !existingByName.has(key)) existingByName.set(key, e);
  }

  const out: MergedItem[] = [];
  const consumed = new Set<string>();

  for (const item of batchMerged) {
    const ex = existingByName.get(item.normalized_name);
    if (!ex) {
      out.push(item);
      continue;
    }
    consumed.add(item.normalized_name);
    const compatible =
      ex.unit == null || item.unit == null || unitsCompatible(ex.unit, item.unit);
    if (compatible) {
      let quantity: number | null;
      if (ex.quantity != null && item.quantity != null) quantity = ex.quantity + item.quantity;
      else if (ex.quantity != null) quantity = ex.quantity;
      else if (item.quantity != null) quantity = item.quantity;
      else quantity = null;
      out.push({
        name: ex.name,
        normalized_name: item.normalized_name,
        unit: ex.unit ?? item.unit,
        quantity,
        sources: 2,
      });
    } else {
      // Incompatible units: the new detection replaces the old row.
      out.push(item);
    }
  }

  for (const [key, e] of existingByName) {
    if (!consumed.has(key)) {
      out.push({
        name: e.name,
        normalized_name: key,
        unit: e.unit,
        quantity: e.quantity,
        sources: 1,
      });
    }
  }

  // The pantry table allows ONE row per normalized name (unique constraint).
  // If a batch somehow yields several incompatible-unit rows for the same
  // name (e.g. "2 cups milk" + "200 g milk"), keep the first (primary) row.
  const byName = new Map<string, MergedItem>();
  for (const item of out) {
    if (!byName.has(item.normalized_name)) byName.set(item.normalized_name, item);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface GroceryRowLike {
  normalized_name: string;
  unit: string | null;
  quantity: number | null;
}

/**
 * Given the list's current rows and the in-memory merged result, return only
 * the rows whose quantity actually changed (or that are new). Unchanged rows —
 * including already-purchased ones — are left untouched in the DB so their
 * `completed` state is preserved (blueprint KI-1).
 *
 * Key = normalized_name + raw unit string (matches the DB unique constraint on
 * (grocery_list_id, normalized_name, unit_key) where unit_key = COALESCE(unit,'')).
 */
export function selectChangedGroceryItems(
  current: GroceryRowLike[],
  merged: MergedItem[],
): Omit<MergedItem, "sources">[] {
  const currentByKey = new Map<string, GroceryRowLike>();
  for (const c of current) {
    const key = `${c.normalized_name}\u0000${c.unit ?? ""}`;
    if (!currentByKey.has(key)) currentByKey.set(key, c);
  }
  const changed: Omit<MergedItem, "sources">[] = [];
  for (const m of merged) {
    const key = `${m.normalized_name}\u0000${m.unit ?? ""}`;
    const c = currentByKey.get(key);
    if (c && c.quantity === m.quantity) continue; // unchanged — keep DB row (and its completed flag)
    changed.push({ name: m.name, normalized_name: m.normalized_name, quantity: m.quantity, unit: m.unit });
  }
  return changed;
}
