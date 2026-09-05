import { createClient } from "./supabase/server";

/** Public, user-safe auth error message. */
export function publicError(err: unknown): string {
  const msg =
    (err as { error_description?: string; message?: string })?.error_description ||
    (err as Error)?.message ||
    "Authentication failed.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait and try again.";
  if (/invalid login/i.test(msg)) return "Invalid email or password.";
  if (/already been registered/i.test(msg)) return "That email is already registered.";
  if (/email.*not.*confirmed|confirm/i.test(msg)) return "Please confirm your email before signing in.";
  return msg;
}

/** Get the current authenticated user, or null. Server components/actions only. */
export async function getCurrentUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Require auth; returns the user or null. */
export async function requireUser() {
  return getCurrentUser();
}
