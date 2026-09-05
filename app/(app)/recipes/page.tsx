import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserPantry } from "@/lib/db";
import RecipeGenerator from "@/components/recipe-generator";

export const metadata = { title: "Recipes" };
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const pantry = await getUserPantry(user.id).catch(() => []);
  return <RecipeGenerator pantry={pantry.map((p) => p.name)} />;
}
