import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasAnyProvider } from "@/lib/config";
import { signOutAndRedirect } from "@/lib/actions";
import { Card, Button, Badge } from "@/components/ui";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const provider = hasAnyProvider() ? "Configured" : "Not configured";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">Settings</h1>
        <p className="mt-1 text-ink-500">Manage your account and preferences.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-ink-900">Account</h2>
        <dl className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-ink-500">Email</dt>
            <dd className="text-sm font-medium text-ink-800">{user.email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-sm text-ink-500">Member since</dt>
            <dd className="text-sm font-medium text-ink-800">
              {new Date(user.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-ink-900">AI provider</h2>
        <p className="mt-1 text-sm text-ink-500">
          Vision + recipe generation runs on the server using your configured provider (OpenAI or Gemini).
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone={provider === "Configured" ? "herb" : "tomato"}>{provider}</Badge>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          If not configured, set <code className="rounded bg-ink-100 px-1">OPENAI_API_KEY</code> or{" "}
          <code className="rounded bg-ink-100 px-1">GOOGLE_GENERATIVE_AI_API_KEY</code> in <code className="rounded bg-ink-100 px-1">.env</code>.
        </p>
      </Card>

      <Card className="flex items-center justify-between p-6">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Sign out</h2>
          <p className="mt-1 text-sm text-ink-500">End your session on this device.</p>
        </div>
        <form action={signOutAndRedirect}>
          <Button type="submit" variant="danger">Sign out</Button>
        </form>
      </Card>
    </div>
  );
}
