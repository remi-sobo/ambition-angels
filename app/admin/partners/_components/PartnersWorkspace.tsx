"use client";

// The Schools & Partners workspace: KPI stat boxes (the "Active partners"
// box doubles as a filter toggle), two tabs (Pipeline vs Prospects), a
// filter bar (search · type · area), and rows you can advance a stage,
// log a touch, or open. Mirrors the donors list ergonomics; filtering is
// client-side since the partner set is small.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  STATUS_ORDER, STATUS_LABELS, STATUS_SHORT, STATUS_STYLE,
  TAB_STATUSES, NEXT_STATUS, type TabKey, type PartnerStatus,
} from "../_lib/status";
import { KIND_LABELS, type Partner } from "../_lib/partners";
import { computePartnerKpis, isActivePartner } from "../_lib/kpis";
import { scoreBand, SCORE_BAND_STYLE } from "../_lib/rubric";
import StatCard from "../../_components/StatCard";
import PartnersBoard from "./PartnersBoard";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "prospects", label: "Prospects" },
  { key: "all", label: "All" },
];

export default function PartnersWorkspace({ partners }: { partners: Partner[] }) {
  const [view, setView] = useState<"list" | "board">("list");
  const [tab, setTab] = useState<TabKey>("pipeline");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [region, setRegion] = useState<string>("all");
  const [taskFilter, setTaskFilter] = useState<"all" | "open" | "overdue">("all");
  // The "Active partners" stat box is a toggle: on → only active/anchor rows,
  // regardless of which tab is selected (so the filter always shows results).
  const [activeOnly, setActiveOnly] = useState(false);

  const kpis = useMemo(() => computePartnerKpis(partners), [partners]);

  // Area chips from whatever geography we have (region preferred).
  const regions = useMemo(() => {
    const set = new Map<string, number>();
    for (const p of partners) {
      const r = (p.region || "").trim();
      if (r) set.set(r, (set.get(r) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
  }, [partners]);

  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = { pipeline: 0, prospects: 0, all: partners.length };
    for (const p of partners) {
      if ((TAB_STATUSES.pipeline as readonly string[]).includes(p.status)) c.pipeline++;
      if (p.status === "prospect") c.prospects++;
    }
    return c;
  }, [partners]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const allowed = TAB_STATUSES[tab] as readonly string[];
    return partners.filter((p) => {
      if (activeOnly) {
        if (!isActivePartner(p)) return false;
      } else if (!allowed.includes(p.status)) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (region !== "all" && (p.region || "") !== region) return false;
      if (taskFilter === "open" && !(p.open_tasks && p.open_tasks > 0)) return false;
      if (taskFilter === "overdue" && !(p.overdue_tasks && p.overdue_tasks > 0)) return false;
      if (needle) {
        const hay = `${p.name} ${p.city ?? ""} ${p.region ?? ""} ${p.primary_contact ?? ""} ${p.domain ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [partners, tab, q, kind, region, taskFilter, activeOnly]);

  // Board view spans every status as a column, so it ignores the tab's status
  // restriction but honours the search / type / area / task filters.
  const boardItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (activeOnly && !isActivePartner(p)) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (region !== "all" && (p.region || "") !== region) return false;
      if (taskFilter === "open" && !(p.open_tasks && p.open_tasks > 0)) return false;
      if (taskFilter === "overdue" && !(p.overdue_tasks && p.overdue_tasks > 0)) return false;
      if (needle) {
        const hay = `${p.name} ${p.city ?? ""} ${p.region ?? ""} ${p.primary_contact ?? ""} ${p.domain ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [partners, q, kind, region, taskFilter, activeOnly]);

  // Highest-fit first, then unscored, then alphabetical.
  const byScore = (a: Partner, b: Partner) => {
    const sa = a.priority_score ?? -1, sb = b.priority_score ?? -1;
    if (sa !== sb) return sb - sa;
    return a.name.localeCompare(b.name);
  };

  // Group by stage (pipeline/all/active-only) or flat (prospects).
  const groups = useMemo(() => {
    if (tab === "prospects" && !activeOnly) {
      return [{ status: "prospect" as PartnerStatus, rows: [...filtered].sort(byScore) }];
    }
    const order = STATUS_ORDER.filter(
      (s) => activeOnly || (TAB_STATUSES[tab] as readonly string[]).includes(s)
    );
    return order
      .map((status) => ({ status, rows: filtered.filter((p) => p.status === status).sort(byScore) }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, tab, activeOnly]);

  return (
    <div className="space-y-5">
      {/* KPI boxes. "Active partners" is a toggle — click filters the list
          below to active/anchor orgs, click again clears. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <button
          type="button"
          onClick={() => setActiveOnly((v) => !v)}
          aria-pressed={activeOnly}
          title={activeOnly ? "Click to show all partners" : "Click to show only active partners"}
          className={`text-left w-full rounded-card-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/60 ${
            activeOnly ? "ring-2 ring-orange" : "hover:ring-2 hover:ring-orange/30"
          }`}
        >
          <StatCard
            label="Active partners"
            value={kpis.active}
            sub={activeOnly ? "filtering — click to clear" : `${kpis.live} live in pipeline`}
          />
        </button>
        <StatCard label="Emerging" value={kpis.emerging} sub="in outreach / piloting" muted={kpis.emerging === 0} />
        <StatCard label="Prospects" value={kpis.prospects} sub="cold + inbound" muted={kpis.prospects === 0} />
        <StatCard
          label="Need a touch"
          value={kpis.staleTouch + kpis.mouExpiring + kpis.mouExpired}
          sub={
            kpis.mouExpired > 0
              ? `${kpis.mouExpired} MOU expired`
              : kpis.mouExpiring > 0
              ? `${kpis.mouExpiring} MOU expiring`
              : "active, 30+ days quiet"
          }
          muted={kpis.staleTouch + kpis.mouExpiring + kpis.mouExpired === 0}
        />
      </div>

      {partners.length === 0 ? (
        <p className="text-sm text-ink-2">
          No partners yet — add your first school or nonprofit partner, or wait for the public
          signup form to feed prospects in.
        </p>
      ) : (
        <>
      {/* Tabs (list only) + view toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          className={`inline-flex items-center gap-1 bg-tile border-[1.5px] border-outline rounded-full p-1 ${
            view === "board" ? "invisible" : ""
          }`}
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                tab === t.key ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 ${tab === t.key ? "text-white/80" : "text-ink-3"}`}>
                {tabCounts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 bg-tile border-[1.5px] border-outline rounded-full p-1">
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full capitalize transition-colors ${
                view === v ? "bg-orange text-white" : "text-ink-2 hover:text-ink-1"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {activeOnly && (
          <Chip active onClick={() => setActiveOnly(false)}>
            Active partners only <span className="opacity-60">✕</span>
          </Chip>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, city, contact…"
          className="bg-tile border-[1.5px] border-outline rounded-full px-4 py-1.5 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/40 w-64"
        />
        <Chip active={kind === "all"} onClick={() => setKind("all")}>All types</Chip>
        {["school", "nonprofit"].map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? "all" : k)}>
            {KIND_LABELS[k]}s
          </Chip>
        ))}
        {regions.length > 0 && <span className="w-px h-5 bg-outline mx-1" />}
        <Chip active={region === "all"} onClick={() => setRegion("all")}>All areas</Chip>
        {regions.map(([r, n]) => (
          <Chip key={r} active={region === r} onClick={() => setRegion(region === r ? "all" : r)}>
            {r} <span className="opacity-60">{n}</span>
          </Chip>
        ))}
        {(partners.some((p) => p.open_tasks) || taskFilter !== "all") && (
          <>
            <span className="w-px h-5 bg-outline mx-1" />
            <Chip active={taskFilter === "open"} onClick={() => setTaskFilter(taskFilter === "open" ? "all" : "open")}>
              Has tasks <span className="opacity-60">{partners.filter((p) => p.open_tasks).length}</span>
            </Chip>
            <Chip active={taskFilter === "overdue"} onClick={() => setTaskFilter(taskFilter === "overdue" ? "all" : "overdue")}>
              Overdue <span className="opacity-60">{partners.filter((p) => p.overdue_tasks).length}</span>
            </Chip>
          </>
        )}
      </div>

      {/* Cross-tab pointer: a newly-added partner defaults to Prospect, which
          the Pipeline tab hides — so it can look "lost". Surface it. */}
      {view === "list" && !activeOnly && tab !== "prospects" && tabCounts.prospects > 0 && (
        <button
          onClick={() => setTab("prospects")}
          className="block w-full text-left text-xs text-ink-2 bg-tile border-[1.5px] border-outline rounded-lg px-4 py-2 hover:border-orange/40 hover:text-ink-1 transition-colors"
        >
          {tabCounts.prospects} prospect{tabCounts.prospects === 1 ? "" : "s"} {tabCounts.prospects === 1 ? "isn't" : "aren't"} shown on this tab —{" "}
          <span className="font-semibold text-orange">view Prospects →</span>
        </button>
      )}

      {/* Rows */}
      {view === "board" ? (
        <PartnersBoard partners={boardItems} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-2 py-6">
          {activeOnly ? "No active partners yet." : "No partners match these filters."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.status}>
              {(activeOnly || tab !== "prospects") && (
                <h3 className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
                  {STATUS_LABELS[g.status]} ({g.rows.length})
                </h3>
              )}
              <div className="space-y-2">
                {g.rows.map((p) => <PartnerRow key={p.id} partner={p} />)}
              </div>
            </section>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-full border-[1.5px] transition-colors ${
        active
          ? "bg-orange/15 text-orange border-orange/30"
          : "bg-tile text-ink-2 border-outline hover:text-ink-1"
      }`}
    >
      {children}
    </button>
  );
}

function PartnerRow({ partner: p }: { partner: Partner }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/partners/manage/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const mouExpired = p.mou_status === "signed" && !!p.mou_end && p.mou_end < today;
  const stale =
    (p.status === "active" || p.status === "anchor") &&
    (!p.last_touch_at ||
      p.last_touch_at < new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const next = NEXT_STATUS[p.status as PartnerStatus];
  const geo = [p.city, p.region].filter(Boolean).join(", ");

  return (
    <article
      className={`bg-surface border rounded-xl p-3 text-sm ${
        mouExpired ? "border-expense/30" : "border-outline"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/partners/${p.id}`} className="font-semibold text-ink-1 hover:text-orange transition-colors">
          {p.name}
        </Link>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>
          {STATUS_SHORT[p.status] ?? p.status}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tile text-ink-2 uppercase tracking-wider">
          {KIND_LABELS[p.kind] ?? p.kind}
        </span>
        {p.priority_score != null && (
          <span
            title="Fit score"
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${SCORE_BAND_STYLE[scoreBand(p.priority_score)]}`}
          >
            {p.priority_score}
          </span>
        )}
        {geo && <span className="text-[11px] text-ink-2">{geo}</span>}
        {typeof p.contact_count === "number" && p.contact_count > 0 && (
          <span className="text-[11px] text-ink-3">
            {p.contact_count} contact{p.contact_count === 1 ? "" : "s"}
          </span>
        )}
        {typeof p.open_tasks === "number" && p.open_tasks > 0 && (
          <span
            title={p.overdue_tasks ? `${p.overdue_tasks} overdue` : "open tasks"}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              p.overdue_tasks ? "bg-expense-bg text-expense" : "bg-orange/15 text-orange"
            }`}
          >
            {p.open_tasks} task{p.open_tasks === 1 ? "" : "s"}
            {p.overdue_tasks ? ` · ${p.overdue_tasks} overdue` : ""}
          </span>
        )}
        {p.mou_status === "signed" && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            mouExpired ? "bg-expense-bg text-expense" : "bg-revenue-bg text-revenue"
          }`}>
            MOU{p.mou_end ? ` · ${mouExpired ? "expired" : "ends"} ${p.mou_end}` : ""}
          </span>
        )}
        <span className={`ml-auto text-[11px] tabular-nums ${stale ? "text-[#A56A1B]" : "text-ink-3"}`}>
          {p.last_touch_at ? `touched ${p.last_touch_at}` : "never touched"}
        </span>
      </div>

      {p.primary_contact && (
        <p className="text-[12px] text-ink-2 mt-1">Primary: {p.primary_contact}</p>
      )}

      <div className="flex flex-wrap items-center gap-1 mt-2">
        <select
          value={p.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value })}
          className="text-[11px] bg-tile border-[1.5px] border-outline rounded-md px-2 py-1 text-ink-1 cursor-pointer"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s} className="bg-surface">{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {next && (
          <button
            onClick={() => patch({ status: next })}
            disabled={busy}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-orange/15 text-orange hover:bg-orange/25"
          >
            Move to {STATUS_SHORT[next]} →
          </button>
        )}
        <button
          onClick={() => patch({ touch: true })}
          disabled={busy}
          className="px-2 py-1 rounded-md text-[11px] bg-tile hover:bg-[#EFE6D4] text-ink-2"
        >
          Log touch
        </button>
        <Link
          href={`/admin/partners/${p.id}`}
          className="ml-auto px-2 py-1 rounded-md text-[11px] font-semibold text-ink-2 hover:text-orange"
        >
          Open →
        </Link>
      </div>
    </article>
  );
}
