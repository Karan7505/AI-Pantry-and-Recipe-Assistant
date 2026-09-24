import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Hardened session cookie options (audit H-2):
 * - httpOnly: the auth token is never readable from browser JS (this app never
 *   reads it client-side — all auth goes through server actions/route handlers)
 * - secure: enforced in production (HTTPS)
 * - maxAge: 30 days instead of the 400-day library default
 */
const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

/**
 * Server-side Supabase client (Next 15: cookies() is async).
 * User-scoped; RLS applies on top.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...cookieOptions, ...options }),
            );
          } catch {
            // Called from a Server Component — safe to ignore when the
            // middleware refreshes sessions.
          }
        },
      },
    },
  );
}
