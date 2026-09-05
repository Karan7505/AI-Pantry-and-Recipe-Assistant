"use server";

import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { publicError } from "./auth";

export interface AuthResponse {
  ok: boolean;
  error?: string;
  needsEmailConfirm?: boolean;
}

export async function signInAction(email: string, password: string): Promise<AuthResponse> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: publicError(error) };
  return { ok: true };
}

export async function signUpAction(email: string, password: string): Promise<AuthResponse> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: publicError(error) };
  if (data.user && !data.user.confirmed_at) {
    return { ok: true, needsEmailConfirm: true };
  }
  return { ok: true };
}

export async function signOutAction(): Promise<AuthResponse> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: publicError(error) };
  return { ok: true };
}

/** Form-action variant: signs out then redirects (must return void). */
export async function signOutAndRedirect() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
