"use client";

import { useState } from "react";

export type HsEngagement = {
  hubspot_id: string;
  engagement_type: string | null;
  subject: string | null;
  body_preview: string | null;
  occurred_at: string | null;
};

const TYPE_STYLES: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  meeting: "bg-revenue-bg text-revenue border-revenue/30",
  note: "bg-gray-500/15 text-ink-2 border-gray-500/30",
  task: "bg-[#F4E8D0] text-[#A56A1B] border-[#D9BE86]",
  call: "bg-purple-500/15 text-purple-700 border-purple-500/30",
};

const PREVIEW_MAX = 200;

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TypeBadge({ type }: { type: string | null }) {
  const cls =
    TYPE_STYLES[type ?? ""] ?? "bg-tile text-ink-2 border-outline";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider font-semibold ${cls}`}
    >
      {type ?? "engagement"}
    </span>
  );
}

function EngagementRow({ e }: { e: HsEngagement }) {
  const [expanded, setExpanded] = useState(false);
  const preview = e.body_preview ?? "";
  const truncated = preview.length > PREVIEW_MAX;
  const visible = !truncated || expanded ? preview : preview.slice(0, PREVIEW_MAX);

  return (
    <li className="relative pl-6 pb-5 border-l border-outline last:border-l-transparent last:pb-0">
      <span className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-orange/60 ring-2 ring-ink" />
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
        <TypeBadge type={e.engagement_type} />
        <span
          className="text-xs text-ink-2"
          title={fmtAbsolute(e.occurred_at)}
        >
          {fmtRelative(e.occurred_at)}
        </span>
      </div>
      {e.subject && (
        <div className="mt-1.5 text-ink-1 font-medium text-sm">{e.subject}</div>
      )}
      {preview && (
        <div className="mt-1 text-sm text-ink-2 leading-relaxed whitespace-pre-wrap break-words">
          {visible}
          {truncated && !expanded && <span className="text-ink-2">…</span>}
          {truncated && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 text-xs text-orange hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function EngagementTimeline({
  engagements,
}: {
  engagements: HsEngagement[];
}) {
  return (
    <section className="rounded-card border-[1.5px] border-outline bg-surface p-6">
      <h2 className="text-xs uppercase tracking-wider text-ink-2 mb-4">
        Recent Engagement{" "}
        <span className="text-ink-3">
          ({engagements.length}
          {engagements.length === 50 ? " most recent" : ""})
        </span>
      </h2>
      {engagements.length === 0 ? (
        <p className="text-sm text-ink-2">No engagement history.</p>
      ) : (
        <ol className="mt-2">
          {engagements.map((e) => (
            <EngagementRow key={e.hubspot_id} e={e} />
          ))}
        </ol>
      )}
    </section>
  );
}
