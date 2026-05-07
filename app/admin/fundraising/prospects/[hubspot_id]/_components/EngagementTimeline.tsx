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
  email: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  meeting: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  note: "bg-gray-500/15 text-cream/70 border-gray-500/30",
  task: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  call: "bg-purple-500/15 text-purple-300 border-purple-500/30",
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
    TYPE_STYLES[type ?? ""] ?? "bg-white/5 text-cream/60 border-white/10";
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
    <li className="relative pl-6 pb-5 border-l border-white/10 last:border-l-transparent last:pb-0">
      <span className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-orange/60 ring-2 ring-ink" />
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
        <TypeBadge type={e.engagement_type} />
        <span
          className="text-xs text-gray-mid"
          title={fmtAbsolute(e.occurred_at)}
        >
          {fmtRelative(e.occurred_at)}
        </span>
      </div>
      {e.subject && (
        <div className="mt-1.5 text-cream font-medium text-sm">{e.subject}</div>
      )}
      {preview && (
        <div className="mt-1 text-sm text-cream/70 leading-relaxed whitespace-pre-wrap break-words">
          {visible}
          {truncated && !expanded && <span className="text-gray-mid">…</span>}
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
    <section className="rounded-card border border-white/10 bg-black/30 p-6">
      <h2 className="text-xs uppercase tracking-wider text-gray-mid mb-4">
        Recent Engagement{" "}
        <span className="text-cream/40">
          ({engagements.length}
          {engagements.length === 50 ? " most recent" : ""})
        </span>
      </h2>
      {engagements.length === 0 ? (
        <p className="text-sm text-gray-mid">No engagement history.</p>
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
