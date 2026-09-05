import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ScanFlow from "@/components/scan-flow";

export const metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ScanFlow />;
}
