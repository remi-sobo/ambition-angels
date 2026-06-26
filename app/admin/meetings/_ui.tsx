import { type ReactNode } from "react";
import { type FollowUpStatus, type MatchedEntity } from "@/lib/meetings/types";

/**
 * Shared presentational atoms for the Meetings surface (list + detail). No
 * hooks / no server-only imports, so both the server list page and the client
 * detail component render the same brand language.
 */

export const STATUS: Record<FollowUpStatus, { label: string; pill: string; dot: string }> = {
  needs_follow_up: { label: "Needs follow-up", pill: "bg-status-watch-bg text-ink-1 border-status-watch/40", dot: "bg-status-watch" },
  has_follow_up: { label: "Has follow-up", pill: "bg-status-healthy-bg text-ink-1 border-status-healthy/40", dot: "bg-status-healthy" },
  none_needed: { label: "No follow-up", pill: "bg-status-neutral-bg text-ink-2 border-outline", dot: "bg-gray-mid" },
  dismissed: { label: "Dismissed", pill: "bg-status-neutral-bg text-ink-3 border-outline", dot: "bg-gray-mid" },
};

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

// A constituent (donor) reads warm; a partner reads cool. Quietly distinct.
export function Avatar({ entity, size = "sm" }: { entity: MatchedEntity; size?: "sm" | "md" }) {
  const tone = entity.type === "partner" ? "bg-gray-light text-charcoal" : "bg-orange-light text-orange-dark";
  const dim = size === "md" ? "w-9 h-9 text-[12px]" : "w-7 h-7 text-[10px]";
  return (
    <span className={`shrink-0 inline-flex items-center justify-center rounded-full font-bold uppercase ${dim} ${tone}`}>
      {initials(entity.name)}
    </span>
  );
}

export function MatchCluster({ matched, muted = false }: { matched: MatchedEntity[]; muted?: boolean }) {
  if (matched.length === 0) {
    return <span className="text-[11px] text-ink-3 italic">unmatched</span>;
  }
  const [primary, ...rest] = matched;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {!muted && <Avatar entity={primary} />}
      <span className="inline-flex items-baseline gap-1.5 min-w-0">
        <span className={`text-[13px] truncate ${muted ? "text-ink-2" : "text-ink-1 font-medium"}`}>{primary.name}</span>
        {rest.length > 0 && <span className="text-[11px] text-ink-3 shrink-0">+{rest.length}</span>}
      </span>
    </span>
  );
}

export function StatusPill({ status }: { status: FollowUpStatus }) {
  const s = STATUS[status];
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3">
      <span className="w-[3px] h-3.5 rounded-full bg-orange translate-y-[1px]" aria-hidden />
      <h2 className="text-xs uppercase tracking-[0.12em] font-heading font-semibold text-ink-2">{children}</h2>
      {count != null && <span className="font-display font-black text-ink-3 text-sm leading-none">{count}</span>}
    </div>
  );
}
