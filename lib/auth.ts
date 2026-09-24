import { createClient } from "./supabase/server";

/**
 * Public, user-safe auth error message (audit L-2/L-4):
 * - generic where possible to avoid account enumeration
 * - raw provider text never returned to the client (logged server-side only)
 */
export function publicError(err: unknown): string {
  const msg =
    (err as { error_description?: string; message?: string })?.error_description ||
    (err as Error)?.message ||
    "Authentication failed.";
  console.error("[auth]", msg);
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a moment and try again.";
  if (/invalid login/i.test(msg)) return "Invalid email or password.";
  if (/already been registered/i.test(msg))
    return "Unable to create the account. If you already have one, sign in instead.";
  if (/email confirmation/i.test(msg)) return "Please confirm your email before signing in.";
  if (/password/i.test(msg)) return "Please check your password and try again.";
  return "Authentication failed. Please try again.";
}

/** Authenticated user, or null. Server-only (uses request cookies). */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Returns user id or throws; use inside server actions. */
export async function requireUid(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}
