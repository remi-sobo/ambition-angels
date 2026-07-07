"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SectionHeading from "../../../_components/SectionHeading";
import EmptyState from "../../../_components/EmptyState";
import { StatusChip } from "../../../_components/StatusChip";
import { planHealthToStatus } from "@/lib/admin/status";
import type { StaffGoal, StaffKpi } from "../../_lib/read";

type AutoOption = { key: string; label: string; unit: string };

const HEALTH_OPTIONS = ["not_started", "on_track", "at_risk", "behind", "done"] as const;
const HEALTH_LABEL: Record<string, string> = {
  not_started: "Not started",
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  done: "Done",
};

function fmt(value: number | null, unit: string | null): string {
  if (value == null) return "—";
  switch (unit) {
    case "usd":
      return value >= 1000 ? `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `$${value}`;
    case "pct":
      return `${value}%`;
    case "months":
      return `${value} mo`;
    default:
      return `${value}`;
  }
}

function staleness(cadence: string | null, lastUpdated: string | null): string | null {
  if (!lastUpdated) return null;
  const days = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86_400_000);
  const window = cadence === "weekly" ? 7 : cadence === "monthly" ? 31 : cadence === "quarterly" ? 93 : null;
  if (window && days > window) return `${days}d old`;
  return days <= 0 ? "today" : `${days}d ago`;
}

const CARD = "rounded-card border-[1.5px] border-outline bg-tile shadow-tile";
const FIELD =
  "rounded-md border border-outline bg-surface px-2 py-1 text-sm text-ink-1 placeholder:text-ink-3";

// ── Goals ─────────────────────────────────────────────────────────────────────
function GoalsSection({
  staffId,
  goals,
  canApprove,
}: {
  staffId: string;
  goals: StaffGoal[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", period: "", target_date: "", metric_type: "qualitative" });

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) router.refresh();
      else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(b?.error ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!form.title.trim()) return;
    await call(`/api/admin/staff/${staffId}/goals`, "POST", {
      ...form,
      approval_status: "proposed",
    });
    setForm({ title: "", period: "", target_date: "", metric_type: "qualitative" });
    setAdding(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeading>Goals</SectionHeading>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-semibold text-orange hover:text-orange-dark"
        >
          {adding ? "Cancel" : "+ Add goal"}
        </button>
      </div>

      {adding && (
        <div className={`${CARD} p-3 mb-3 flex flex-col gap-2`}>
          <input
            className={FIELD}
            placeholder="Goal title (SMART)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <input
              className={FIELD}
              placeholder="Period (FY26)"
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            />
            <input
              type="date"
              className={FIELD}
              value={form.target_date}
              onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            />
            <select
              className={FIELD}
              value={form.metric_type}
              onChange={(e) => setForm({ ...form, metric_type: e.target.value })}
            >
              <option value="qualitative">Qualitative</option>
              <option value="numeric">Numeric</option>
              <option value="milestone">Milestone</option>
            </select>
            <button
              type="button"
              disabled={busy || !form.title.trim()}
              onClick={add}
              className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
            >
              Propose
            </button>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState
          label="Goals"
          hint="Period objectives for this person, optionally cascading from a strategy goal."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((g) => (
            <li key={g.id} className={`${CARD} p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-1">{g.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-ink-2">
                    {g.period && <span>{g.period}</span>}
                    {g.target_date && <span>· due {g.target_date}</span>}
                    {g.approval_status !== "approved" && (
                      <span className="uppercase tracking-wide text-ink-3">{g.approval_status}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip status={planHealthToStatus(g.status)}>
                    {HEALTH_LABEL[g.status] ?? g.status}
                  </StatusChip>
                  {canApprove && g.approval_status === "proposed" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call(`/api/admin/staff/${staffId}/goals/${g.id}`, "PATCH", {
                          approval_status: "approved",
                        })
                      }
                      className="text-xs font-semibold text-status-healthy hover:underline"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call(`/api/admin/staff/${staffId}/goals/${g.id}`, "DELETE")}
                    className="text-ink-3 hover:text-status-critical"
                    aria-label="Delete goal"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <select
                  className={`${FIELD} text-xs`}
                  value={g.status}
                  disabled={busy}
                  onChange={(e) =>
                    call(`/api/admin/staff/${staffId}/goals/${g.id}`, "PATCH", { status: e.target.value })
                  }
                >
                  {HEALTH_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {HEALTH_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function KpisSection({
  staffId,
  kpis,
  autoOptions,
}: {
  staffId: string;
  kpis: StaffKpi[];
  autoOptions: AutoOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logId, setLogId] = useState<string | null>(null);
  const [logValue, setLogValue] = useState("");
  const [form, setForm] = useState({ title: "", source: "manual", linked_metric_key: "", target: "", cadence: "", unit: "" });
  const hasAuto = kpis.some((k) => k.source === "auto");

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) router.refresh();
      else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(b?.error ?? "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const isAuto = form.source === "auto";
    if (isAuto && !form.linked_metric_key) return;
    if (!isAuto && !form.title.trim()) return;
    await call(`/api/admin/staff/${staffId}/kpis`, "POST", {
      title: form.title || undefined,
      source: form.source,
      linked_metric_key: isAuto ? form.linked_metric_key : undefined,
      target: form.target || undefined,
      cadence: form.cadence || undefined,
      unit: form.unit || undefined,
    });
    setForm({ title: "", source: "manual", linked_metric_key: "", target: "", cadence: "", unit: "" });
    setAdding(false);
  }

  async function logSnapshot(kpiId: string) {
    if (!logValue.trim()) return;
    await call(`/api/admin/staff/${staffId}/kpis/${kpiId}/snapshot`, "POST", { value: logValue });
    setLogId(null);
    setLogValue("");
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionHeading>KPIs</SectionHeading>
        <div className="flex items-center gap-3">
          {hasAuto && (
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/admin/staff/${staffId}/kpis/refresh`, "POST")}
              className="text-xs font-semibold text-ink-2 hover:text-orange"
            >
              ↻ Refresh auto
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-xs font-semibold text-orange hover:text-orange-dark"
          >
            {adding ? "Cancel" : "+ Add KPI"}
          </button>
        </div>
      </div>

      {adding && (
        <div className={`${CARD} p-3 mb-3 flex flex-col gap-2`}>
          <div className="flex flex-wrap gap-2">
            <select
              className={FIELD}
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option value="manual">Manual</option>
              <option value="auto">Auto (from the spine)</option>
            </select>
            {form.source === "auto" ? (
              <select
                className={FIELD}
                value={form.linked_metric_key}
                onChange={(e) => setForm({ ...form, linked_metric_key: e.target.value })}
              >
                <option value="">Choose a metric…</option>
                {autoOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={FIELD}
                placeholder="KPI title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${FIELD} w-24`}
              placeholder="Target"
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
            />
            <input
              className={`${FIELD} w-28`}
              placeholder="Cadence"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value })}
            />
            <button
              type="button"
              disabled={busy}
              onClick={add}
              className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {kpis.length === 0 ? (
        <EmptyState
          label="KPIs"
          hint="Recurring personal metrics with targets — auto ones read straight from the BloomOS spine."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {kpis.map((k) => (
            <li key={k.id} className={`${CARD} p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-1">{k.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-ink-2">
                    <span className="tabular-nums">
                      {fmt(k.current, k.unit)}
                      {k.target != null && <span className="text-ink-3"> / {fmt(k.target, k.unit)}</span>}
                    </span>
                    <span className="uppercase tracking-wide text-ink-3">{k.source}</span>
                    {staleness(k.cadence, k.last_updated_at) && (
                      <span className="text-ink-3">· {staleness(k.cadence, k.last_updated_at)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusChip status={planHealthToStatus(k.status)}>{k.status.replace("_", " ")}</StatusChip>
                  {k.source === "manual" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setLogId(logId === k.id ? null : k.id);
                        setLogValue("");
                      }}
                      className="text-xs font-semibold text-orange hover:text-orange-dark"
                    >
                      Log value
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call(`/api/admin/staff/${staffId}/kpis/${k.id}`, "DELETE")}
                    className="text-ink-3 hover:text-status-critical"
                    aria-label="Delete KPI"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {logId === k.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    className={`${FIELD} w-28`}
                    placeholder="New value"
                    value={logValue}
                    onChange={(e) => setLogValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && logSnapshot(k.id)}
                  />
                  <button
                    type="button"
                    disabled={busy || !logValue.trim()}
                    onClick={() => logSnapshot(k.id)}
                    className="rounded-md bg-orange px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DevelopmentSections({
  staffId,
  goals,
  kpis,
  canApprove,
  autoOptions,
}: {
  staffId: string;
  goals: StaffGoal[];
  kpis: StaffKpi[];
  canApprove: boolean;
  autoOptions: AutoOption[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <GoalsSection staffId={staffId} goals={goals} canApprove={canApprove} />
      <KpisSection staffId={staffId} kpis={kpis} autoOptions={autoOptions} />
    </div>
  );
}
