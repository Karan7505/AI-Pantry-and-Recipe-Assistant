import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserPantry } from "@/lib/db";
import PantryManager from "@/components/pantry-manager";

export const metadata = { title: "Pantry" };
export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const items = await getUserPantry(user.id).catch(() => []);
  return <PantryManager initialItems={items} />;
}
