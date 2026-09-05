import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createScan } from "@/lib/db";
import { analyzePantryImage } from "@/lib/ai/services";
import { scanInputSchema } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/pantry/scan
 * body: { images: string[] }  (base64 data URLs, client-compressed)
 * → { ok, data: { ingredients, notes? } }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = scanInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid images." },
      { status: 400 },
    );
  }

  try {
    const ingredients = await analyzePantryImage(parsed.data.images);
    await createScan(user.id, null, ingredients);
    return NextResponse.json({ ok: true, data: { ingredients } });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json({ ok: false, error: err.userMessage, code: err.code }, { status: 502 });
    }
    console.error("[scan] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "Something went wrong while analyzing your images." }, { status: 500 });
  }
}
