"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signInAction, signUpAction } from "@/lib/actions";
import { Button, Card, Field, Input } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const isSignup = mode === "signup";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (isSignup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = isSignup
        ? await signUpAction(email, password)
        : await signInAction(email, password);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      if (res.needsEmailConfirm) {
        setNotice("Account created! Check your inbox to confirm your email, then sign in.");
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-app flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-herb-600 text-white">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3c3 3 5 5 5 9a5 5 0 01-10 0c0-4 2-6 5-9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold text-ink-900">Pantry</span>
        </Link>

        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {isSignup
              ? "Start scanning your pantry and cooking in minutes."
              : "Sign in to continue to your pantry."}
          </p>

          {notice && (
            <div className="mt-4 rounded-xl border border-herb-200 bg-herb-50 px-4 py-3 text-sm text-herb-800">
              {notice}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </Field>
            {isSignup && (
              <Field label="Confirm password" htmlFor="confirm">
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                />
              </Field>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-tomato-200 bg-tomato-50 px-4 py-3 text-sm text-tomato-700">
                {error}
              </div>
            )}

            <Button type="submit" full size="lg" loading={loading}>
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-ink-500">
          {isSignup ? (
            <>Already have an account? <Link className="font-medium text-herb-700 hover:underline" href="/login">Sign in</Link></>
          ) : (
            <>New here? <Link className="font-medium text-herb-700 hover:underline" href="/signup">Create an account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
