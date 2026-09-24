import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserPantry } from "@/lib/db";
import { generateRecipes } from "@/lib/ai/services";
import { recipeFiltersSchema } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/errors";
import { rateLimit } from "@/lib/ratelimit";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/recipes
 * body: RecipeFilters (all optional)
 * → { ok, data: { recipes: Recipe[] } }
 *
 * Recipes are generated against the user's ACTUAL pantry (loaded server-side).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  if (!rateLimit(user.id, "recipes")) {
    return NextResponse.json({ ok: false, error: "Too many recipe generations right now. Please try again in an hour." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const filters = recipeFiltersSchema.safeParse(body ?? {});
  if (!filters.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid filters." },
      { status: 400 },
    );
  }

  let pantry;
  try {
    pantry = await getUserPantry(user.id);
  } catch (err) {
    console.error("[recipes] pantry read failed:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: "Could not load your pantry. Please try again." },
      { status: 500 },
    );
  }

  try {
    const recipes = await generateRecipes(
      pantry.map((p) => ({ name: p.name })),
      filters.data,
    );
    return NextResponse.json({ ok: true, data: { recipes } });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json({ ok: false, error: err.userMessage, code: err.code }, { status: 502 });
    }
    logError("api:recipes", "recipe generation failed", { error: (err as Error).message });
    return NextResponse.json({ ok: false, error: "Recipe generation failed. Please try again." }, { status: 500 });
  }
}
