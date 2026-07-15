"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FollowupLite } from "@/lib/admin/briefing/sources";
import { TYPE } from "@/lib/admin/typeScale";

// Email follow-ups section — the Cowork/Gmail 24h list, surfaced so they're
// never missed. Each row shows a live SLA countdown off when it landed, the
// HubSpot-contact context, an "Open email" link parsed from the task, and a
// one-tap Done that completes the underlying task.

const SLA_HOURS = 24;

function gmailLink(description: string | null): string | null {
  if (!description) return null;
  const urls = description.match(/https?:\/\/[^\s)]+/g);
  if (!urls) return null;
  return urls.find((u) => /mail\.google\.com|google\.com\/mail/.test(u)) ?? urls[0];
}

// Strip the "Photo:"/link lines so the snippet reads as the human note.
function snippet(description: string | null): string {
  if (!description) return "";
  return description
    .split("\n")
    .filter((l) => !/^https?:\/\//.test(l.trim()) && !/^photo:/i.test(l.trim()))
    .join(" ")
    .replace(/https?:\/\/[^\s)]+/g, "")
    .trim();
}

type Sla = { label: string; tone: string };
function sla(createdAt: string, now: number): Sla {
  const deadline = Date.parse(createdAt) + SLA_HOURS * 3_600_000;
  const hours = Math.round((deadline - now) / 3_600_000);
  if (hours < 0) return { label: `${Math.abs(hours)}h overdue`, tone: "bg-expense-bg text-expense border-expense/30" };
  if (hours <= 6) return { label: `${hours}h left`, tone: "bg-status-watch-bg text-status-watch-text border-[#C8881B]/30" };
  return { label: `${hours}h left`, tone: "bg-revenue-bg text-revenue border-revenue/30" };
}

export default function FollowUps({ followups }: { followups: FollowupLite[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  // Stable "now" for this render so every row's SLA is computed off one clock.
  const now = useMemo(() => Date.now(), []);

  const visible = followups
    .filter((f) => !done.has(f.id))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); // oldest/most-urgent first

  if (visible.length === 0) return null;

  async function markDone(id: string) {
    setDone((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/admin/ops/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      router.refresh();
    } catch {
      // Re-show the row if the write failed.
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className={TYPE.cardTitle}>
          Email follow-ups <span className="text-ink-3 font-normal">· {visible.length}</span>
        </h2>
        <span className="text-[11px] text-ink-3">reply within {SLA_HOURS}h</span>
      </div>

      <div className="space-y-2">
        {visible.map((f) => {
          const s = sla(f.created_at, now);
          const link = gmailLink(f.description);
          const note = snippet(f.description);
          return (
            <div
              key={f.id}
              className="rounded-card border-[1.5px] border-outline bg-surface shadow-panel px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border tabular-nums ${s.tone}`}>
                      {s.label}
                    </span>
                  </div>
                  <h3 className="font-heading font-semibold text-[14px] text-ink-1 leading-snug truncate">
                    {f.title.replace(/^Follow up:\s*/i, "")}
                  </h3>
                  {note && <p className="text-xs text-ink-2 mt-0.5 line-clamp-2">{note}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-3 py-1.5 rounded-full transition-colors"
                  >
                    Open email
                  </a>
                )}
                <button
                  onClick={() => markDone(f.id)}
                  className="text-xs font-semibold text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-3 py-1.5 rounded-full transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
