"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Recipe, RecipeFilters, MealType } from "@/lib/types";
import { saveRecipeAction } from "@/lib/actions-data";
import { formatMinutes, totalMinutes } from "@/lib/utils";
import { Button, Card, Badge, Field, Input, Select, ErrorState, EmptyState, Skeleton } from "./ui";

export default function RecipeGenerator({ pantry }: { pantry: string[] }) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<RecipeFilters>({ excluded: [] });
  const [excludedText, setExcludedText] = React.useState("");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [recipes, setRecipes] = React.useState<Recipe[] | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  const set = (patch: Partial<RecipeFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...filters, excluded: excludedText.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Recipe generation failed.");
      setRecipes(json.data.recipes as Recipe[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const save = async (r: Recipe) => {
    setSaving(r.title);
    const id = await saveRecipeAction(r);
    setSaving(null);
    router.push(`/recipes/${id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">Recipes</h1>
        <p className="mt-1 text-ink-500">
          {pantry.length === 0
            ? "Your pantry is empty. Add ingredients first for the best matches."
            : `Finding recipes you can make with your ${pantry.length} ingredients.`}
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Servings" htmlFor="servings">
            <Select id="servings" value={filters.servings ?? ""} onChange={(e) => set({ servings: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Meal type" htmlFor="meal">
            <Select id="meal" value={filters.mealType ?? "any"} onChange={(e) => set({ mealType: e.target.value as MealType })}>
              <option value="any">Any</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </Select>
          </Field>
          <Field label="Max time" htmlFor="maxtime">
            <Select id="maxtime" value={filters.maxCookTimeMinutes ?? ""} onChange={(e) => set({ maxCookTimeMinutes: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Any</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </Select>
          </Field>
          <Field label="Cuisine" htmlFor="cuisine">
            <Input id="cuisine" value={filters.cuisine ?? ""} onChange={(e) => set({ cuisine: e.target.value || undefined })} placeholder="e.g. Indian, Mexican" />
          </Field>
        </div>

        <button onClick={() => setShowAdvanced((v) => !v)} className="mt-3 text-sm font-medium text-herb-700 hover:underline focus-ring rounded px-1">
          {showAdvanced ? "Hide" : "Show"} more filters
        </button>

        {showAdvanced && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Dietary preference" htmlFor="dietary">
              <Input id="dietary" value={filters.dietary ?? ""} onChange={(e) => set({ dietary: e.target.value || undefined })} placeholder="e.g. vegetarian, high-protein" />
            </Field>
            <Field label="Excluded ingredients" htmlFor="excluded" hint="Comma-separated, e.g. nuts, shellfish">
              <Input id="excluded" value={excludedText} onChange={(e) => setExcludedText(e.target.value)} placeholder="nuts, shellfish" />
            </Field>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-ink-400">All filters are optional — generate anytime.</p>
          <Button onClick={generate} loading={loading} size="lg">
            {recipes ? "Regenerate" : "Generate recipes"}
          </Button>
        </div>
      </Card>

      {error && <ErrorState message={error} retry={generate} />}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
              <div className="mt-4 flex gap-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-24" /></div>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && recipes && recipes.length === 0 && (
        <EmptyState title="No recipes" description="Try adjusting your filters or adding more ingredients." />
      )}

      {!loading && recipes && recipes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {recipes.map((r) => (
            <RecipeCard key={r.title} recipe={r} saving={saving === r.title} onOpen={() => save(r)} />
          ))}
        </div>
      )}

      {!recipes && !loading && !error && pantry.length === 0 && (
        <EmptyState title="Add ingredients first" description="Scan your pantry or add items so we can match recipes." />
      )}
    </div>
  );
}

export function RecipeCard({
  recipe,
  saving,
  onOpen,
}: {
  recipe: Recipe;
  saving?: boolean;
  onOpen?: () => void;
}) {
  const missing = recipe.ingredients.filter((i) => !i.available);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink-900">{recipe.title}</h3>
        <Badge tone={recipe.matchScore >= 100 ? "herb" : recipe.matchScore >= 75 ? "amber" : "tomato"}>
          {Math.round(recipe.matchScore)}%
        </Badge>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-ink-500">{recipe.description}</p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-500">
        <Badge>{formatMinutes(totalMinutes(recipe.prepTimeMinutes, recipe.cookTimeMinutes))}</Badge>
        <Badge>Serves {recipe.servings}</Badge>
        {recipe.mealType && recipe.mealType !== "any" && <Badge>{recipe.mealType}</Badge>}
        {recipe.cuisine && <Badge>{recipe.cuisine}</Badge>}
      </div>

      <div className="mt-3 text-sm">
        {missing.length === 0 ? (
          <p className="text-herb-700">You have everything you need.</p>
        ) : (
          <p className="text-ink-600">
            <span className="font-medium">Missing:</span>{" "}
            {missing.slice(0, 3).map((m) => m.name).join(", ")}
            {missing.length > 3 && ` +${missing.length - 3} more`}
          </p>
        )}
      </div>

      <div className="mt-4 border-t border-ink-100 pt-4">
        <Button size="sm" full onClick={onOpen} loading={saving}>
          {saving ? "Opening…" : "View recipe"}
        </Button>
      </div>
    </Card>
  );
}
