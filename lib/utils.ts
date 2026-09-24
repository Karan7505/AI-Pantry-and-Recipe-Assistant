import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return a safe same-origin path for post-auth redirect (audit M-1).
 * Rejects absolute URLs (https://…), protocol-relative (//…), and control chars.
 * Falls back to `fallback` for anything unsafe.
 */
export function sanitizeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  // Must be a single absolute path: starts with "/", not "//", no backslashes,
  // no whitespace, and no "scheme:" pattern.
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("%") &&
    !/\s/.test(trimmed) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return trimmed;
  }
  return fallback;
}

/** "2 pieces" / "250 g" / "unknown" */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ? `some` : "unknown";
  if (unit) {
    const label = String(quantity);
    return `${label} ${unit}`;
  }
  return String(quantity);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function totalMinutes(pre: number, cook: number): number {
  return Math.max(pre, cook);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}
