import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateNutrition } from "@/lib/ai/services";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().min(1).max(140),
  ingredients: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
});

/**
 * POST /api/nutrition
 * body: { title, ingredients: string[] }
 * → { ok, data: Nutrition }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  if (!rateLimit(user.id, "nutrition")) {
    return NextResponse.json({ ok: false, error: "Too many requests right now. Please try again in an hour." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid ingredients." }, { status: 400 });
  }

  try {
    const nutrition = await generateNutrition(parsed.data.title, parsed.data.ingredients);
    return NextResponse.json({ ok: true, data: nutrition });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json({ ok: false, error: err.userMessage, code: err.code }, { status: 502 });
    }
    console.error("[nutrition] unexpected error:", (err as Error).name, (err as Error).message);
    return NextResponse.json({ ok: false, error: "Could not estimate nutrition. Please try again." }, { status: 500 });
  }
}
