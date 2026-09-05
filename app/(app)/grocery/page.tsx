import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultGroceryList, getGroceryItems } from "@/lib/db";
import GroceryManager from "@/components/grocery-manager";

export const metadata = { title: "Grocery list" };
export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const list = await getDefaultGroceryList(user.id).catch(() => null);
  const groceryItems = list ? await getGroceryItems(list.id).catch(() => []) : [];
  return <GroceryManager initialItems={groceryItems} />;
}
