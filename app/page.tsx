import Link from "next/link";
import { Button } from "@/components/ui";

const STEPS = [
  { n: "1", title: "Snap your fridge", body: "Upload one or more photos of your fridge, pantry, or groceries." },
  { n: "2", title: "Confirm ingredients", body: "Review what AI detected, correct quantities, add or remove items." },
  { n: "3", title: "Get matched recipes", body: "Recipes ranked by how much you already own — with missing items flagged." },
  { n: "4", title: "Shop the gap", body: "Auto-build a grocery list from missing ingredients and track nutrition." },
];

export default function Landing() {
  return (
    <div className="bg-app min-h-[100dvh]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-herb-600 text-white">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3c3 3 5 5 5 9a5 5 0 01-10 0c0-4 2-6 5-9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-lg font-semibold text-ink-900">Pantry</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" href="/login" size="sm">Sign in</Button>
          <Button href="/signup" size="sm">Get started</Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-herb-100 px-3 py-1 text-xs font-medium text-herb-700">
            AI-powered cooking assistant
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
            Turn your kitchen into tonight&apos;s dinner.
          </h1>
          <p className="mt-4 text-lg text-ink-600">
            Photograph your fridge or pantry. Pantry detects your ingredients, recommends recipes
            you can actually make, lists what&apos;s missing, and shows the nutrition.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href="/signup" size="lg">Start cooking free</Button>
            <Button href="/login" size="lg" variant="secondary">I have an account</Button>
          </div>
          <p className="mt-4 text-sm text-ink-400">Works with your own Supabase + AI provider keys.</p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-herb-600 font-display text-lg font-semibold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-1.5 text-sm text-ink-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink-100">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-ink-400 sm:px-6">
          Pantry · AI Pantry & Recipe Assistant
        </div>
      </footer>
    </div>
  );
}
