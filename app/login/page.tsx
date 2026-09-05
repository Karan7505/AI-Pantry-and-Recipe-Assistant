import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = { title: "Sign in" };

function Fallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-herb-600 border-t-transparent" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
