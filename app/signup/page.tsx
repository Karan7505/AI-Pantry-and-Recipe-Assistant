import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Create account" };

// Session-aware page: render per request (also avoids static prerendering of
// the Suspense-wrapped client form).
export const dynamic = "force-dynamic";

function Fallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-herb-600 border-t-transparent" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
