"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { confirmPantryItems } from "@/lib/actions-data";
import { CATEGORIES, type Category } from "@/lib/types";
import { Button, Card, Field, Input, Select, Badge, EmptyState, ErrorState, SectionTitle } from "./ui";

type Detected = {
  name: string;
  quantity: number | null;
  unit: string | null;
  confidence: number;
};

type Stage = "upload" | "working" | "confirm";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 8;
const MAX_IMAGES = 6;

export default function ScanFlow() {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("upload");
  const [files, setFiles] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [detected, setDetected] = React.useState<Detected[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const onFiles = (list: FileList | null) => {
    setError(null);
    if (!list) return;
    const incoming = Array.from(list);
    for (const f of incoming) {
      if (!ACCEPTED.includes(f.type)) {
        setError(`"${f.name}" is not a supported format. Use JPG, PNG, or WebP.`);
        return;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`"${f.name}" is larger than ${MAX_MB} MB.`);
        return;
      }
    }
    const merged = [...files, ...incoming].slice(0, MAX_IMAGES);
    setFiles(merged);
    const urls = merged.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...urls]);
  };

  const removeAt = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const analyze = async () => {
    setError(null);
    if (files.length === 0) return;
    setStage("working");
    try {
      const dataUrls = await Promise.all(files.map(fileToDataUrl));
      const res = await fetch("/api/pantry/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: dataUrls }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Analysis failed.");
      setDetected(json.data.ingredients as Detected[]);
      setStage("confirm");
    } catch (e) {
      setError((e as Error).message);
      setStage("upload");
    }
  };

  const reset = () => {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setFiles([]);
    setPreviews([]);
    setDetected([]);
    setError(null);
    setStage("upload");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">Scan your pantry</h1>
        <p className="mt-1 text-ink-500">
          Upload photos of your fridge, pantry, or groceries. We&apos;ll detect the ingredients.
        </p>
      </div>

      {stage === "upload" && (
        <>
          <Dropzone
            previews={previews}
            onFiles={onFiles}
            onRemove={removeAt}
            disabled={submitting}
          />
          {error && <ErrorState message={error} />}
          <div className="flex items-center justify-between">
            {files.length > 0 ? (
              <button onClick={reset} className="text-sm text-ink-500 hover:text-ink-700 focus-ring rounded px-1">
                Clear all
              </button>
            ) : (
              <span />
            )}
            <Button onClick={analyze} disabled={files.length === 0} size="lg">
              Analyze {files.length} photo{files.length === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}

      {stage === "working" && (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-herb-600 border-t-transparent" />
          <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">Analyzing your photos…</h3>
          <p className="mt-1 text-sm text-ink-500">Detecting ingredients with AI. This usually takes a few seconds.</p>
        </Card>
      )}

      {stage === "confirm" && (
        <ConfirmEditor
          items={detected}
          onCancel={reset}
          onConfirm={async (final) => {
            setSubmitting(true);
            await confirmPantryItems(
              final.map((f) => ({
                name: f.name,
                quantity: f.quantity,
                unit: f.unit,
                category: undefined as Category | null | undefined,
              })),
            );
            setSubmitting(false);
            router.push("/pantry");
            router.refresh();
          }}
          submitting={submitting}
        />
      )}
    </div>
  );
}

// ── Dropzone ─────────────────────────────────────────────────────────────────
function Dropzone({
  previews,
  onFiles,
  onRemove,
  disabled,
}: {
  previews: string[];
  onFiles: (list: FileList | null) => void;
  onRemove: (idx: number) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) onFiles(e.dataTransfer.files); }}
      className={
        "rounded-2xl border-2 border-dashed p-6 transition-colors " +
        (dragging ? "border-herb-500 bg-herb-50" : "border-ink-200 bg-white/60")
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 py-6 text-center focus-ring rounded-xl"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-herb-100 text-herb-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="font-medium text-ink-800">Click to upload or drag & drop</span>
        <span className="text-xs text-ink-400">JPG, PNG, or WebP · up to {MAX_MB} MB each · max {MAX_IMAGES} photos</span>
      </button>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map((src, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink-900/70 text-white hover:bg-ink-900 focus-ring"
                aria-label="Remove image"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Confirmation editor ──────────────────────────────────────────────────────
function ConfirmEditor({
  items,
  onConfirm,
  onCancel,
  submitting,
}: {
  items: Detected[];
  onConfirm: (items: Detected[]) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [rows, setRows] = React.useState(
    items.map((i) => ({ ...i, category: guessCategory(i.name) })),
  );

  const patch = (idx: number, p: Partial<typeof rows[number]>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  const remove = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const add = () => setRows((prev) => [...prev, { name: "", quantity: null, unit: null, confidence: 1, category: "other" as Category }]);

  const lowConfidence = rows.filter((r) => r.confidence < 0.6).length;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Detected ingredients"
        subtitle={`Review and correct what we found in ${items.length} item${items.length === 1 ? "" : "s"}.`}
      />
      {lowConfidence > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Badge tone="amber">{lowConfidence} low-confidence</Badge>
          We&apos;re not fully sure about some items — please double-check them.
        </div>
      )}

      <Card className="divide-y divide-ink-100">
        {rows.length === 0 && (
          <EmptyState title="No ingredients" description="Add one manually below, or go back and try another photo." />
        )}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 p-3">
            <Input
              value={r.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              placeholder="Ingredient"
              className="min-w-[140px] flex-1"
              aria-label={`Ingredient ${i + 1} name`}
            />
            <Input
              inputMode="decimal"
              value={r.quantity != null ? String(r.quantity) : ""}
              onChange={(e) => patch(i, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Qty"
              className="w-20"
              aria-label={`Ingredient ${i + 1} quantity`}
            />
            <Input
              value={r.unit ?? ""}
              onChange={(e) => patch(i, { unit: e.target.value || null })}
              placeholder="unit"
              className="w-24"
              aria-label={`Ingredient ${i + 1} unit`}
            />
            <Select
              value={r.category}
              onChange={(e) => patch(i, { category: e.target.value as Category })}
              className="w-32"
              aria-label={`Ingredient ${i + 1} category`}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            {r.confidence < 0.6 && <Badge tone="amber">uncertain</Badge>}
            <button onClick={() => remove(i)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-tomato-50 hover:text-tomato-600 focus-ring" aria-label="Remove ingredient">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={add}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          Add ingredient
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Discard</Button>
          <Button
            size="lg"
            loading={submitting}
            disabled={rows.filter((r) => r.name.trim()).length === 0}
            onClick={() => onConfirm(rows.filter((r) => r.name.trim()))}
          >
            Confirm & add to pantry
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/egg/.test(n)) return "egg";
  if (/(milk|cheese|butter|yogurt|cream|ghee|paneer)/.test(n)) return "dairy";
  if (/(chicken|beef|pork|lamb|bacon|ground|steak)/.test(n)) return "meat";
  if (/(fish|shrimp|salmon|tuna|cod|prawn|crab|lobster)/.test(n)) return "fish";
  if (/(rice|flour|oat|pasta|noodle|bread|quinoa|barley|wheat|corn)/.test(n)) return "grain";
  if (/(sauce|ketchup|soy|mustard|mayo|chili|tomato paste)/.test(n)) return "sauce";
  if (/(salt|pepper|spice|cumin|turmeric|cinnamon|paprika|garlic|onion|ginger)/.test(n)) return "spice";
  if (/(juice|soda|water|tea|coffee|milk)/.test(n)) return "drink";
  if (/(apple|banana|orange|mango|berry|grape|melon|lemon|lime|avocado|kiwi|pear|cherry|peach)/.test(n)) return "fruit";
  if (/(potato|tomato|carrot|pepper|lettuce|cabbage|broccoli|spinach|cucumber|onion|garlic|mushroom|celery|beet|corn|pea|bean|zucchini|cauliflower|pumpkin|eggplant)/.test(n)) return "vegetable";
  return "other";
}

async function fileToDataUrl(file: File): Promise<string> {
  // Downscale large images to keep the request payload small.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });

  const isBig = file.size > 1.5 * 1024 * 1024;
  if (!isBig) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1024;
      let { width, height } = img;
      if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
      else if (height >= width && height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
