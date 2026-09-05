"use client";

import { BarList, Card, Subtitle, Title } from "@tremor/react";
import type { Nutrition } from "@/lib/types";

type Macro = { name: string; value: number; color?: string };

export default function NutritionPanel({ nutrition }: { nutrition: Nutrition }) {
  const macros: Macro[] = [
    { name: "Protein", value: nutrition.proteinGrams, color: "#2F855A" },
    { name: "Carbs", value: nutrition.carbsGrams, color: "#E89C1C" },
    { name: "Fat", value: nutrition.fatGrams, color: "#D9553C" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Summary cards */}
      <Card className="p-5">
        <Title>Nutrition per serving</Title>
        <Subtitle className="mt-0.5">AI estimate — not medical guidance</Subtitle>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Calories" value={Math.round(nutrition.calories)} unit="kcal" accent="tomato" />
          <Stat label="Protein" value={Math.round(nutrition.proteinGrams)} unit="g" accent="herb" />
          <Stat label="Carbs" value={Math.round(nutrition.carbsGrams)} unit="g" accent="amber" />
          <Stat label="Fat" value={Math.round(nutrition.fatGrams)} unit="g" accent="ink" />
          {nutrition.fiberGrams != null && (
            <Stat label="Fiber" value={Math.round(nutrition.fiberGrams)} unit="g" accent="herb" />
          )}
        </div>
        {(nutrition.sugarGrams != null || nutrition.sodiumMilligrams != null || nutrition.saturatedFatGrams != null) && (
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-ink-100 pt-3">
            {nutrition.sugarGrams != null && <Stat label="Sugar" value={Math.round(nutrition.sugarGrams)} unit="g" accent="amber" small />}
            {nutrition.saturatedFatGrams != null && <Stat label="Sat. fat" value={Math.round(nutrition.saturatedFatGrams)} unit="g" accent="tomato" small />}
            {nutrition.sodiumMilligrams != null && <Stat label="Sodium" value={Math.round(nutrition.sodiumMilligrams)} unit="mg" accent="ink" small />}
          </div>
        )}
      </Card>

      {/* Macronutrient chart */}
      <Card className="p-5">
        <Title>Macronutrients</Title>
        <Subtitle className="mt-0.5">Grams per serving</Subtitle>
        <div className="mt-4">
          <BarList data={macros} valueFormatter={(v: number) => `${Math.round(v)} g`} showAnimation={false} />
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
  small,
}: {
  label: string;
  value: number;
  unit: string;
  accent: "herb" | "tomato" | "amber" | "ink";
  small?: boolean;
}) {
  const accents: Record<string, string> = {
    herb: "text-herb-700",
    tomato: "text-tomato-600",
    amber: "text-amber-600",
    ink: "text-ink-700",
  };
  return (
    <div className="rounded-xl bg-ink-50/70 px-3 py-2.5">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className={"font-display font-semibold " + (small ? "text-lg" : "text-2xl")}>
        <span className={accents[accent]}>{value}</span>
        <span className="ml-1 text-sm font-normal text-ink-400">{unit}</span>
      </div>
    </div>
  );
}
