import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRecipe, getUserPantry } from "@/lib/db";
import { formatMinutes, totalMinutes, formatQuantity } from "@/lib/utils";
import { matchLabel } from "@/lib/match";
import { Badge, Card } from "@/components/ui";
import NutritionPanel from "@/components/nutrition-panel";
import AddToGrocery from "@/components/add-to-grocery";

export const metadata = { title: "Recipe" };
export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params; // Next 15: params is async
  const [row, pantry] = await Promise.all([
    getRecipe(user.id, id).catch(() => null),
    getUserPantry(user.id).catch(() => []),
  ]);
  if (!row) notFound();
  const r = row.recipe;
  const missing = r.ingredients.filter((i) => !i.available);
  const have = r.ingredients.filter((i) => i.available);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-ink-400">
        <Link href="/recipes" className="hover:text-ink-700 focus-ring rounded px-1">Recipes</Link>
        <span>/</span>
        <span className="text-ink-600">{r.title}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-semibold text-ink-900">{r.title}</h1>
          <p className="mt-2 text-ink-600">{r.description}</p>
        </div>
        <Badge tone={r.matchScore >= 100 ? "herb" : r.matchScore >= 75 ? "amber" : "tomato"}>
          {Math.round(r.matchScore)}% match · {matchLabel(r.matchScore, missing.length)}
        </Badge>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Prep" value={formatMinutes(r.prepTimeMinutes)} />
        <Meta label="Cook" value={formatMinutes(r.cookTimeMinutes)} />
        <Meta label="Total" value={formatMinutes(totalMinutes(r.prepTimeMinutes, r.cookTimeMinutes))} />
        <Meta label="Servings" value={String(r.servings)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: ingredients + grocery CTA */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Ingredients</h2>
            <ul className="mt-3 space-y-2">
              {r.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={"h-2 w-2 rounded-full " + (ing.available ? "bg-herb-500" : "bg-tomato-400")} />
                    <span className={ing.available ? "text-ink-700" : "text-ink-900 font-medium"}>{ing.name}</span>
                  </span>
                  <span className="text-ink-400">{formatQuantity(ing.quantity, ing.unit) || "to taste"}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <AddToGrocery
                items={missing.map((m) => ({ name: m.name, quantity: m.quantity, unit: m.unit }))}
                recipeTitle={r.title}
              />
              {missing.length > 0 && (
                <p className="mt-2 text-xs text-ink-400">
                  Only items you don&apos;t already have are added. You have {have.length} of {r.ingredients.length}.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right: instructions */}
        <div className="lg:col-span-3">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Instructions</h2>
            <ol className="mt-3 space-y-3">
              {r.instructions.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-herb-100 text-sm font-semibold text-herb-700">{i + 1}</span>
                  <span className="pt-0.5 text-sm text-ink-700">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {/* Nutrition */}
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-ink-900">Nutrition</h2>
        <NutritionPanel nutrition={r.nutrition} />
        <p className="text-xs text-ink-400">
          Nutrition values are AI-generated estimates for the listed servings and are not a substitute for professional dietary advice.
        </p>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold text-ink-900">{value}</div>
    </Card>
  );
}
