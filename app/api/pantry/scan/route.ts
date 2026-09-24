import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createScan } from "@/lib/db";
import { analyzePantryImage } from "@/lib/ai/services";
import { scanInputSchema } from "@/lib/ai/schemas";
import { AiError } from "@/lib/ai/errors";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 6 images × 4.5 MB base64 + JSON overhead (audit H-1: hard server-side cap).
const MAX_BODY_CHARS = 28_000_000;

/**
 * POST /api/pantry/scan
 * body: { images: string[] }  (base64 data URLs, jpeg/png/webp)
 * → { ok, data: { ingredients, notes? } }
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  if (!rateLimit(user.id, "scan")) {
    return NextResponse.json({ ok: false, error: "Too many scans right now. Please try again in an hour." }, { status: 429 });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_CHARS) {
    return NextResponse.json({ ok: false, error: "Request too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = scanInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Images must be JPEG, PNG or WebP photos (max 8 MB each, up to 6)." }, { status: 400 });
  }

  try {
    const ingredients = await analyzePantryImage(parsed.data.images);
    await createScan(user.id, ingredients);
    return NextResponse.json({ ok: true, data: { ingredients } });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json({ ok: false, error: err.userMessage, code: err.code }, { status: 502 });
    }
    console.error("[scan] unexpected error:", (err as Error).name, (err as Error).message);
    return NextResponse.json({ ok: false, error: "Something went wrong while analyzing your images." }, { status: 500 });
  }
}
