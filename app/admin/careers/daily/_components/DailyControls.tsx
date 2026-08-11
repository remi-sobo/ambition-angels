"use client";

// The calendar rows: one per day, a picker per row. Saving hits the admin
// route, which re-checks both gates and the 3-of-7 low-zone rule and
// refuses a save that would break them — the notice under the row is that
// refusal, verbatim.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DailyCandidate = { soc_code: string; title: string; job_zone: number };
export type DailyRow = { day: string; soc_code: string };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DailyControls({
  today,
  horizonDays,
  candidates,
  scheduled,
}: {
  today: string;
  horizonDays: number;
  candidates: DailyCandidate[];
  scheduled: DailyRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const bySoc = new Map(candidates.map((c) => [c.soc_code, c]));
  const byDay = new Map(scheduled.map((s) => [s.day, s.soc_code]));

  const save = async (day: string, soc: string | null) => {
    setBusy(day);
    setNotices((p) => ({ ...p, [day]: "" }));
    try {
      const res = await fetch("/api/admin/careers/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, soc_code: soc }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotices((p) => ({ ...p, [day]: j.error ?? `That didn't work (HTTP ${res.status}).` }));
      }
      router.refresh();
    } catch {
      setNotices((p) => ({ ...p, [day]: "Network hiccup — try again." }));
    } finally {
      setBusy(null);
    }
  };

  const days = Array.from({ length: horizonDays }, (_, i) =>
    new Date(Date.parse(today) + i * 86_400_000).toISOString().slice(0, 10)
  );

  return (
    <div className="space-y-1.5">
      {days.map((day) => {
        const soc = byDay.get(day) ?? "";
        const picked = soc ? bySoc.get(soc) : undefined;
        const date = new Date(`${day}T12:00:00Z`);
        return (
          <div
            key={day}
            className="bg-surface shadow-panel border-[1.5px] border-outline rounded-xl px-4 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold text-[13px] text-ink-1 w-28 tabular-nums">
                {WEEKDAY[date.getUTCDay()]} {day.slice(5)}
                {day === today && <span className="text-[10px] text-ink-2 block">today</span>}
              </p>
              <select
                value={soc}
                disabled={busy === day}
                onChange={(e) => save(day, e.target.value || null)}
                className="flex-1 min-w-56 border border-outline rounded-lg px-2.5 py-1.5 text-[13px] bg-surface"
              >
                <option value="">— nothing scheduled —</option>
                {candidates.map((c) => (
                  <option key={c.soc_code} value={c.soc_code}>
                    {c.title} · JZ {c.job_zone}
                  </option>
                ))}
              </select>
              {picked && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    picked.job_zone <= 3 ? "bg-revenue-bg text-revenue" : "bg-tile text-ink-2"
                  }`}
                >
                  {picked.job_zone <= 3 ? "No 4-yr degree" : `Job zone ${picked.job_zone}`}
                </span>
              )}
            </div>
            {notices[day] && (
              <p className="text-[12px] text-orange-dark bg-orange-light rounded-lg px-3 py-2 mt-2">
                {notices[day]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
