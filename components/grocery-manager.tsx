"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { GroceryItemRow } from "@/lib/types";
import {
  toggleGroceryItem,
  removeGroceryItem,
  addCustomGroceryItem,
  clearPurchasedGrocery,
} from "@/lib/actions-data";
import { formatQuantity } from "@/lib/utils";
import { Button, Card, Field, Input, EmptyState, Badge } from "./ui";

export default function GroceryManager({ initialItems }: { initialItems: GroceryItemRow[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<GroceryItemRow[]>(initialItems);
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const refresh = () => router.refresh();
  const pending = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);

  const toggle = async (item: GroceryItemRow) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: !i.completed } : i)));
    await toggleGroceryItem(item.id, !item.completed);
    refresh();
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await removeGroceryItem(id);
    refresh();
  };

  const addCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const n = parseFloat(qty);
    await addCustomGroceryItem({
      name: name.trim(),
      quantity: Number.isFinite(n) && n > 0 ? n : null,
      unit: unit.trim() || null,
    });
    setName("");
    setQty("");
    setUnit("");
    refresh();
  };

  const clearDone = async () => {
    setBusy(true);
    setItems((prev) => prev.filter((i) => !i.completed));
    await clearPurchasedGrocery();
    setBusy(false);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Grocery list</h1>
          <p className="mt-1 text-ink-500">
            {pending.length === 0 ? "All caught up!" : `${pending.length} item${pending.length === 1 ? "" : "s"} to buy.`}
          </p>
        </div>
        {done.length > 0 && (
          <Button variant="danger" size="sm" onClick={clearDone} loading={busy}>
            Clear {done.length} purchased
          </Button>
        )}
      </div>

      {/* Add custom */}
      <Card className="p-4">
        <form onSubmit={addCustom} className="flex flex-wrap items-end gap-3">
          <Field label="Add a custom item" htmlFor="g-name" className="min-w-[160px] flex-1">
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cheddar cheese" />
          </Field>
          <Field label="Qty" htmlFor="g-qty" className="w-20">
            <Input id="g-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Unit" htmlFor="g-unit" className="w-24">
            <Input id="g-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, pcs" />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Your grocery list is empty"
          description="Add missing ingredients from a recipe, or type an item above."
        />
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {pending.length > 0 && (
            <Card className="divide-y divide-ink-100">
              {pending.map((item) => (
                <GroceryRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => remove(item.id)} />
              ))}
            </Card>
          )}
          {/* Done */}
          {done.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="herb">{done.length} purchased</Badge>
              </div>
              <Card className="divide-y divide-ink-100 opacity-80">
                {done.map((item) => (
                  <GroceryRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => remove(item.id)} />
                ))}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroceryRow({
  item,
  onToggle,
  onRemove,
}: {
  item: GroceryItemRow;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        onClick={onToggle}
        aria-label={item.completed ? "Mark as not purchased" : "Mark as purchased"}
        className={
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border focus-ring " +
          (item.completed ? "border-herb-500 bg-herb-500 text-white" : "border-ink-300 bg-white text-transparent")
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="min-w-0 flex-1">
        <p className={"truncate text-sm font-medium " + (item.completed ? "text-ink-400 line-through" : "text-ink-800")}>
          {item.name}
        </p>
        {item.source_recipe_title && (
          <p className="truncate text-xs text-ink-400">from {item.source_recipe_title}</p>
        )}
      </div>
      <span className="text-sm text-ink-500">{formatQuantity(item.quantity, item.unit) || ""}</span>
      <button onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-tomato-50 hover:text-tomato-600 focus-ring" aria-label={`Remove ${item.name}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}
