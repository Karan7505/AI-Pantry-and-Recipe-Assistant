"use client";

import * as React from "react";
import { addMissingToGrocery } from "@/lib/actions-data";
import { Button } from "./ui";

export default function AddToGrocery({
  items,
  recipeTitle,
}: {
  items: { name: string; quantity: number | null; unit: string | null }[];
  recipeTitle: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-herb-200 bg-herb-50 px-4 py-3 text-sm text-herb-800">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        You already have everything for this recipe.
      </div>
    );
  }

  const onAdd = async () => {
    setBusy(true);
    const res = await addMissingToGrocery(items, recipeTitle);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setAdded(true);
  };

  return (
    <div>
      <Button size="lg" onClick={onAdd} loading={busy} full>
        {added ? "Added to grocery list" : `Add ${items.length} missing item${items.length === 1 ? "" : "s"} to grocery list`}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-tomato-600">
          {error}
        </p>
      )}
    </div>
  );
}
