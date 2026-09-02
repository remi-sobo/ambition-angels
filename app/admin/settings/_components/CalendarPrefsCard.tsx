"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMinute } from "@/lib/agenda/week-grid";

/**
 * Working-hours preferences for the week grid (calendar_prefs). Save-on-change:
 * each control PATCHes /api/admin/calendar/prefs with optimistic local state,
 * same idiom as the schedule-style settings cards elsewhere.
 */

type Prefs = {
  day_start_minute: number;
  day_end_minute: number;
  default_block_minute: number;
};

const START_OPTIONS = Array.from({ length: 11 }, (_, i) => 300 + i * 30); // 5:00–10:00
const END_OPTIONS = Array.from({ length: 16 }, (_, i) => 960 + i * 30); // 16:00–23:30
const LENGTH_OPTIONS = [30, 45, 60, 90, 120];

export default function CalendarPrefsCard({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setError(null);
    try {
      const r = await fetch("/api/admin/calendar/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setPrefs(prefs); // roll back the optimistic change
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  }

  const select = (
    label: string,
    value: number,
    options: number[],
    onPick: (v: number) => void,
    fmt: (v: number) => string
  ) => (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-2">{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(Number(e.target.value))}
        className="text-sm rounded-lg border border-outline bg-tile text-ink-1 px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-3 max-w-[340px]">
      {select("Day starts", prefs.day_start_minute, START_OPTIONS, (v) => save({ day_start_minute: v }), formatMinute)}
      {select("Day ends", prefs.day_end_minute, END_OPTIONS, (v) => save({ day_end_minute: v }), formatMinute)}
      {select(
        "New blocks default to",
        prefs.default_block_minute,
        LENGTH_OPTIONS,
        (v) => save({ default_block_minute: v }),
        (v) => (v >= 60 ? (v % 60 === 0 ? `${v / 60}h` : `${Math.floor(v / 60)}h ${v % 60}m`) : `${v}m`)
      )}
      {error && <p className="text-xs text-expense">{error}</p>}
    </div>
  );
}
