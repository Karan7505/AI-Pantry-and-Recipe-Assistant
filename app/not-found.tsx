import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="bg-app flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
      <div className="font-display text-6xl font-semibold text-ink-200">404</div>
      <h1 className="mt-3 font-display text-2xl font-semibold text-ink-900">Page not found</h1>
      <p className="mt-2 max-w-sm text-ink-500">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Button href="/" className="mt-6">Back to Pantry</Button>
    </div>
  );
}
