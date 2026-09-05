import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getUserPantry, getRecipes } from "@/lib/db";
import { Button, Card, Badge } from "@/components/ui";
import { daysUntil, formatQuantity } from "@/lib/utils";
import { matchLabel } from "@/lib/match";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 100) return "herb" as const;
  if (score >= 75) return "amber" as const;
  return "tomato" as const;
}

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const [pantry, recipes] = await Promise.all([
    getUserPantry(user.id).catch(() => []),
    getRecipes(user.id).catch(() => []),
  ]);

  const expiring = pantry.filter((p) => {
    const d = daysUntil(p.expiration_date);
    return d != null && d <= 3;
  });

  const firstName = user.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Hi {firstName}
        </h1>
        <p className="mt-1 text-ink-500">
          {pantry.length === 0
            ? "Your pantry is empty — scan a photo to get started."
            : `You have ${pantry.length} ingredient${pantry.length === 1 ? "" : "s"} ready to cook with.`}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/scan" className="group">
          <Card className="h-full p-5 transition-shadow hover:shadow-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-herb-600 text-white">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h3l2-2h6l2 2h3v13H4zM12 17a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-3 font-semibold text-ink-900 group-hover:text-herb-700">Scan ingredients</h3>
            <p className="mt-1 text-sm text-ink-500">Photograph your fridge or pantry.</p>
          </Card>
        </Link>
        <Link href="/recipes" className="group">
          <Card className="h-full p-5 transition-shadow hover:shadow-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 3h12v18l-6-4-6 4zM9 8h6M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-3 font-semibold text-ink-900 group-hover:text-herb-700">Find recipes</h3>
            <p className="mt-1 text-sm text-ink-500">Matched to what you own.</p>
          </Card>
        </Link>
        <Link href="/grocery" className="group">
          <Card className="h-full p-5 transition-shadow hover:shadow-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tomato-500 text-white">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4h2l2 12h11l2-8H7M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-3 font-semibold text-ink-900 group-hover:text-herb-700">Grocery list</h3>
            <p className="mt-1 text-sm text-ink-500">Track what to buy.</p>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pantry snapshot */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink-900">Pantry</h2>
            <Link href="/pantry" className="text-sm font-medium text-herb-700 hover:underline">
              Manage
            </Link>
          </div>
          {pantry.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-ink-500">No ingredients yet. Add some from a scan or manually.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-ink-100">
              {pantry.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-herb-50 text-herb-700">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 3c3 3 5 5 5 9a5 5 0 01-10 0c0-4 2-6 5-9z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink-800">{p.name}</p>
                      <p className="text-xs text-ink-400">
                        {formatQuantity(p.quantity, p.unit)}
                        {p.category ? ` · ${p.category}` : ""}
                      </p>
                    </div>
                  </div>
                  {expiring.some((e) => e.id === p.id) && (
                    <Badge tone="tomato">
                      {daysUntil(p.expiration_date) === 0 ? "Expires today" : `Expires ${Math.abs(daysUntil(p.expiration_date) ?? 0)}d`}
                    </Badge>
                  )}
                </div>
              ))}
              {pantry.length > 6 && (
                <Link href="/pantry" className="block px-4 py-3 text-center text-sm font-medium text-herb-700 hover:bg-herb-50">
                  View all {pantry.length}
                </Link>
              )}
            </Card>
          )}
        </div>

        {/* Recent recipes */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink-900">Recent recipes</h2>
            <Link href="/recipes" className="text-sm font-medium text-herb-700 hover:underline">
              See all
            </Link>
          </div>
          {recipes.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-ink-500">Recipes you save will appear here.</p>
              <Button href="/recipes" size="sm" className="mt-3">Generate recipes</Button>
            </Card>
          ) : (
            <Card className="divide-y divide-ink-100">
              {recipes.slice(0, 5).map(({ id, recipe: r }) => (
                <Link key={id} href={`/recipes/${id}`} className="block px-4 py-3 hover:bg-ink-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{r.title}</p>
                      <p className="text-xs text-ink-400">
                        {r.prepTimeMinutes + r.cookTimeMinutes} min · serves {r.servings}
                      </p>
                    </div>
                    <Badge tone={scoreTone(r.matchScore)}>
                      {Math.round(r.matchScore)}% · {matchLabel(r.matchScore, r.ingredientsMissing.length)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
