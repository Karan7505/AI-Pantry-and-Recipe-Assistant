"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions";
import { Button } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/scan", label: "Scan", icon: "M4 7h3l2-2h6l2 2h3v13H4zM12 17a4 4 0 100-8 4 4 0 000 8z" },
  { href: "/pantry", label: "Pantry", icon: "M3 7h18v13H3zM8 7V5a4 4 0 018 0v2" },
  { href: "/recipes", label: "Recipes", icon: "M6 3h12v18l-6-4-6 4zM9 8h6M9 12h6" },
  { href: "/grocery", label: "Grocery", icon: "M4 4h2l2 12h11l2-8H7M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z" },
];

function NavIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOutAction();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-cream-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-herb-600 text-white">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3c3 3 5 5 5 9a5 5 0 01-10 0c0-4 2-6 5-9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-lg font-semibold text-ink-900">Pantry</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-ring",
                  isActive(item.href)
                    ? "bg-herb-100 text-herb-800"
                    : "text-ink-600 hover:bg-ink-100",
                )}
              >
                <NavIcon d={item.icon} className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/settings" className="hidden rounded-xl p-2 text-ink-500 hover:bg-ink-100 focus-ring md:block" title="Settings">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </Link>
            <Button variant="ghost" size="sm" onClick={onSignOut} loading={signingOut} className="hidden md:inline-flex">
              Sign out
            </Button>

            {/* Mobile toggle */}
            <button
              className="rounded-xl p-2 text-ink-700 hover:bg-ink-100 focus-ring md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <nav className="border-t border-ink-100 bg-cream-50 px-4 pb-4 pt-2 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "inline-flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    isActive(item.href) ? "bg-herb-100 text-herb-800" : "text-ink-700 hover:bg-ink-100",
                  )}
                >
                  <NavIcon d={item.icon} className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                <Link href="/settings" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Settings
                </Link>
                <Button variant="ghost" size="sm" onClick={onSignOut} loading={signingOut}>
                  Sign out
                </Button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
