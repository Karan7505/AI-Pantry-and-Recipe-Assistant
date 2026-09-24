"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PantryItem, Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import {
  addPantryItem,
  updatePantryAction,
  deletePantryAction,
  adjustPantryQuantity,
} from "@/lib/actions-data";
import { formatQuantity, daysUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  Badge,
  Field,
  Input,
  Select,
  EmptyState,
} from "./ui";

type Draft = {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  expiration_date: string;
};

const emptyDraft: Draft = { name: "", quantity: "", unit: "", category: "other", expiration_date: "" };

export default function PantryManager({ initialItems }: { initialItems: PantryItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<PantryItem[]>(initialItems);
  const [query, setQuery] = React.useState("");
  const [cat, setCat] = React.useState<string>("all");
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [editing, setEditing] = React.useState<PantryItem | null>(null);
  const [editDraft, setEditDraft] = React.useState<Draft>(emptyDraft);
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  const refresh = () => router.refresh();

  const filtered = items.filter((i) => {
    const matchQuery = i.name.toLowerCase().includes(query.toLowerCase());
    const matchCat = cat === "all" || i.category === cat;
    return matchQuery && matchCat;
  });

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setAdding(true);
    await addPantryItem({
      name: draft.name,
      quantity: parseQty(draft.quantity),
      unit: draft.unit || null,
      category: (draft.category || "other") as Category,
      expirationDate: draft.expiration_date || null,
    });
    setDraft(emptyDraft);
    setAdding(false);
    refresh();
  };

  const openEdit = (item: PantryItem) => {
    setEditing(item);
    setEditDraft({
      name: item.name,
      quantity: item.quantity != null ? String(item.quantity) : "",
      unit: item.unit ?? "",
      category: item.category ?? "other",
      expiration_date: item.expiration_date ? item.expiration_date.slice(0, 10) : "",
    });
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editDraft.name.trim()) return;
    setBusy(true);
    await updatePantryAction(editing.id, {
      name: editDraft.name,
      quantity: parseQty(editDraft.quantity),
      unit: editDraft.unit || null,
      category: (editDraft.category || "other") as Category,
      expirationDate: editDraft.expiration_date || null,
    });
    setEditing(null);
    setBusy(false);
    refresh();
  };

  const doDelete = async (id: string) => {
    setBusy(true);
    await deletePantryAction(id);
    setBusy(false);
    refresh();
  };

  const step = async (id: string, delta: number) => {
    await adjustPantryQuantity(id, delta);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Pantry</h1>
          <p className="mt-1 text-ink-500">Your current ingredients, {items.length} total.</p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          Add item
        </Button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ingredients…" className="pl-10" aria-label="Search ingredients" />
          </div>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category" className="w-auto">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Your pantry is empty"
          description="Add ingredients manually or scan a photo of your fridge."
          action={<Button onClick={() => setAdding(true)}>Add your first item</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or category." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((item) => {
            const d = daysUntil(item.expiration_date);
            const expiring = d != null && d <= 3;
            return (
              <Card key={item.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink-800">{item.name}</p>
                    {item.category && <Badge>{item.category}</Badge>}
                    {expiring && <Badge tone="tomato">{d === 0 ? "today" : `${d}d`}</Badge>}
                  </div>
                  <p className="text-sm text-ink-500">{formatQuantity(item.quantity, item.unit)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {item.quantity != null && (
                    <>
                      <button onClick={() => step(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 focus-ring" aria-label={`Decrease ${item.name}`}>−</button>
                      <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => step(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 focus-ring" aria-label={`Increase ${item.name}`}>+</button>
                    </>
                  )}
                  <button onClick={() => openEdit(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 focus-ring" aria-label={`Edit ${item.name}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button onClick={() => doDelete(item.id)} disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-tomato-50 hover:text-tomato-600 focus-ring" aria-label={`Delete ${item.name}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      {adding && (
        <Modal title="Add ingredient" onClose={() => setAdding(false)}>
          <form onSubmit={submitAdd} className="space-y-4">
            <IngredientFields draft={draft} onChange={setDraft} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" disabled={busy} loading={busy}>Add</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="space-y-4">
            <IngredientFields draft={editDraft} onChange={setEditDraft} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={busy} loading={busy}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function parseQty(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function IngredientFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <Field label="Name" htmlFor="ing-name">
        <Input id="ing-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Tomato" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" htmlFor="ing-qty" hint="Leave blank if unknown">
          <Input id="ing-qty" inputMode="decimal" value={draft.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder="e.g. 4" />
        </Field>
        <Field label="Unit" htmlFor="ing-unit">
          <Input id="ing-unit" value={draft.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="pieces, g, ml…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" htmlFor="ing-cat">
          <Select id="ing-cat" value={draft.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Expires" htmlFor="ing-exp" hint="Optional">
          <Input id="ing-exp" type="date" value={draft.expiration_date} onChange={(e) => set({ expiration_date: e.target.value })} />
        </Field>
      </div>
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 focus-ring" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
