"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Button ───────────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-herb-600 text-white hover:bg-herb-700 shadow-sm disabled:bg-herb-300",
  secondary:
    "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 shadow-sm",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-white text-tomato-600 border border-tomato-200 hover:bg-tomato-50",
  subtle: "bg-herb-50 text-herb-700 hover:bg-herb-100",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
  full?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  href,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-ring select-none",
    VARIANTS[variant],
    SIZES[size],
    full && "w-full",
    (disabled || loading) && "opacity-60 pointer-events-none",
    className,
  );
  const content = (
    <>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={classes} aria-disabled={disabled || loading}>
        {content}
      </Link>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-ink-100 bg-white shadow-card", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "herb" | "tomato" | "amber" | "ink";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-100 text-ink-700",
    herb: "bg-herb-100 text-herb-700",
    tomato: "bg-tomato-100 text-tomato-700",
    amber: "bg-amber-100 text-amber-800",
    ink: "bg-ink-800 text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────
export const inputClass =
  "w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-800 placeholder:text-ink-300 focus-ring disabled:bg-ink-50 disabled:text-ink-400";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-ink-400">{hint}</p>}
      {error && <p className="text-xs text-tomato-600">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(inputClass, className)} {...rest} />
  ),
);
Input.displayName = "Input";

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-[90px] resize-y", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "appearance-none pr-9 bg-no-repeat bg-[right_0.75rem_center]", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23737b78' stroke-width='2'><path d='M4 6l4 4 4-4'/></svg>\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

// ── Feedback: Spinner / Skeleton / Empty / Error ─────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin text-current", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-100", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-3xl">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
  className,
}: {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-tomato-200 bg-tomato-50/50 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-tomato-100 text-tomato-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-ink-600">{message}</p>}
      {retry && (
        <button
          onClick={retry}
          className="mt-4 inline-flex h-9 items-center rounded-xl border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50 focus-ring"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6", className)}>{children}</div>;
}
