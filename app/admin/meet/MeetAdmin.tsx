"use client";

import { useState } from "react";
import type { Blackout, Booking, MeetingType } from "@/lib/database.types";
import type { OpsTask } from "@/app/admin/ops/_types/ops";
import ConnectionsBacklog from "./ConnectionsBacklog";
import NewConnectionForm from "./NewConnectionForm";

type BookingWithType = Booking & { meeting_type: MeetingType };

type InitialData = {
  types: MeetingType[];
  upcoming: BookingWithType[];
  recent: BookingWithType[];
  blackouts: Blackout[];
  last30Count: number;
  connections: OpsTask[];
};

type Tab = "connections" | "bookings" | "types" | "blackouts";

const TAB_LABELS: Record<Tab, string> = {
  connections: "Connections",
  bookings: "Bookings",
  types: "Types",
  blackouts: "Blackouts",
};

export default function MeetAdmin({ initial }: { initial: InitialData }) {
  const [tab, setTab] = useState<Tab>("connections");
  const [types, setTypes] = useState(initial.types);
  const [upcoming, setUpcoming] = useState(initial.upcoming);
  const [recent, setRecent] = useState(initial.recent);
  const [blackouts, setBlackouts] = useState(initial.blackouts);

  const upcomingThisWeek = upcoming.filter((b) => {
    const ms = new Date(b.start_time).getTime();
    return ms < Date.now() + 7 * 24 * 3600_000;
  }).length;

  // Connections come straight from the server prop (no local copy) so a
  // router.refresh() after any task edit / reorder flows the new list through.
  const openConnections = initial.connections.filter(
    (t) => t.status !== "done"
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Meet</h1>
        <p className="mt-2 text-zinc-400">
          Bookings, meeting types, blackouts.
        </p>
        <div className="mt-5 flex gap-6 text-sm">
          <Stat label="Open connections" value={openConnections} />
          <Stat label="Upcoming" value={upcoming.length} />
          <Stat label="This week" value={upcomingThisWeek} />
          <Stat label="Last 30d" value={initial.last30Count} />
        </div>
      </header>

      <nav className="flex gap-2 border-b border-outline">
        {(["connections", "bookings", "types", "blackouts"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "text-ink-1 border-orange"
                : "text-ink-2 border-transparent hover:text-ink-1",
            ].join(" ")}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {tab === "connections" && (
        <div className="space-y-6">
          <NewConnectionForm />
          <ConnectionsBacklog connections={initial.connections} />
        </div>
      )}
      {tab === "bookings" && (
        <BookingsTab
          upcoming={upcoming}
          recent={recent}
          onCancelled={(id) => {
            setUpcoming((rows) => rows.filter((r) => r.id !== id));
            const cancelled = upcoming.find((r) => r.id === id);
            if (cancelled) {
              setRecent((rows) => [
                { ...cancelled, status: "cancelled" as const },
                ...rows,
              ]);
            }
          }}
        />
      )}
      {tab === "types" && (
        <TypesTab types={types} onUpdated={(updated) => setTypes(updated)} />
      )}
      {tab === "blackouts" && (
        <BlackoutsTab
          blackouts={blackouts}
          types={types}
          onChanged={(updated) => setBlackouts(updated)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-ink-1">{value}</div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">
        {label}
      </div>
    </div>
  );
}

// ── Bookings ─────────────────────────────────────────────────────

function BookingsTab({
  upcoming,
  recent,
  onCancelled,
}: {
  upcoming: BookingWithType[];
  recent: BookingWithType[];
  onCancelled: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  async function cancel(id: string) {
    if (busy) return;
    if (!confirm("Cancel this booking? Attendee will be emailed.")) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/meet/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "cancelled by admin" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        alert(data.error ?? "Cancel failed");
        return;
      }
      onCancelled(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-zinc-500 text-sm">Nothing on the books.</p>
        ) : (
          <BookingTable
            rows={upcoming}
            busy={busy}
            onCancel={cancel}
            canCancel
          />
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowPast((s) => !s)}
          className="text-sm text-ink-2 hover:text-ink-1 transition-colors"
        >
          {showPast ? "Hide" : "Show"} past + cancelled ({recent.length})
        </button>
        {showPast && (
          <div className="mt-4">
            <BookingTable rows={recent} busy={busy} canCancel={false} />
          </div>
        )}
      </section>
    </div>
  );
}

function BookingTable({
  rows,
  busy,
  onCancel,
  canCancel,
}: {
  rows: BookingWithType[];
  busy: string | null;
  onCancel?: (id: string) => void;
  canCancel: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border-[1.5px] border-outline">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-zinc-500 border-b border-outline">
            <th className="px-4 py-3 font-medium">When (PT)</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Attendee</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {canCancel && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-hairline last:border-0">
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDateTime(new Date(r.start_time))}
              </td>
              <td className="px-4 py-3">{r.meeting_type.name}</td>
              <td className="px-4 py-3">
                <div className="text-ink-1">{r.attendee_name}</div>
                <div className="text-xs text-zinc-500">{r.attendee_email}</div>
              </td>
              <td className="px-4 py-3 text-zinc-400">
                {r.attendee_role ?? "—"}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={r.status} />
              </td>
              {canCancel && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => onCancel?.(r.id)}
                    className="text-xs text-orange hover:text-orange-light transition-colors disabled:opacity-50"
                  >
                    {busy === r.id ? "Cancelling…" : "Cancel"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: Booking["status"] }) {
  const styles: Record<Booking["status"], string> = {
    confirmed: "bg-revenue-bg text-revenue border-revenue/30",
    cancelled: "bg-expense-bg text-expense border-expense/30",
    no_show: "bg-[#F4E8D0] text-[#A56A1B] border-[#D9BE86]",
    completed: "bg-zinc-500/15 text-zinc-700 border-zinc-500/30",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

// ── Types ────────────────────────────────────────────────────────

function TypesTab({
  types,
  onUpdated,
}: {
  types: MeetingType[];
  onUpdated: (updated: MeetingType[]) => void;
}) {
  return (
    <div className="space-y-4">
      {types.map((t) => (
        <TypeRow
          key={t.id}
          type={t}
          onSave={(patched) => {
            onUpdated(types.map((x) => (x.id === t.id ? patched : x)));
          }}
        />
      ))}
    </div>
  );
}

function TypeRow({
  type,
  onSave,
}: {
  type: MeetingType;
  onSave: (patched: MeetingType) => void;
}) {
  const [draft, setDraft] = useState({
    name: type.name,
    description: type.description ?? "",
    prep_notes: type.prep_notes ?? "",
    color: type.color ?? "#C0703C",
    duration_minutes: type.duration_minutes,
    buffer_minutes: type.buffer_minutes,
    min_notice_hours: type.min_notice_hours,
    max_advance_days: type.max_advance_days,
    is_active: type.is_active,
    location_options: type.location_options ?? ["video"],
    default_in_person_address: type.default_in_person_address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/meet/types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          default_in_person_address:
            draft.default_in_person_address.trim() || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg(data.error ?? "Save failed");
        return;
      }
      onSave(data.meetingType);
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border-[1.5px] border-outline bg-tile p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: draft.color }}
          />
          <div>
            <div className="font-semibold">{type.name}</div>
            <div className="text-xs text-zinc-500">/{type.slug}</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) =>
              setDraft({ ...draft, is_active: e.target.checked })
            }
          />
          Active
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="admin-input"
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="h-10 w-20 bg-transparent border-[1.5px] border-outline rounded cursor-pointer"
          />
        </Field>
        <Field label="Description">
          <input
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            className="admin-input"
          />
        </Field>
        <Field label="Prep notes">
          <input
            value={draft.prep_notes}
            onChange={(e) =>
              setDraft({ ...draft, prep_notes: e.target.value })
            }
            className="admin-input"
          />
        </Field>
        <Field label="Duration (min)">
          <input
            type="number"
            value={draft.duration_minutes}
            onChange={(e) =>
              setDraft({
                ...draft,
                duration_minutes: Number(e.target.value),
              })
            }
            className="admin-input"
          />
        </Field>
        <Field label="Buffer (min)">
          <input
            type="number"
            value={draft.buffer_minutes}
            onChange={(e) =>
              setDraft({ ...draft, buffer_minutes: Number(e.target.value) })
            }
            className="admin-input"
          />
        </Field>
        <Field label="Min notice (hours)">
          <input
            type="number"
            value={draft.min_notice_hours}
            onChange={(e) =>
              setDraft({
                ...draft,
                min_notice_hours: Number(e.target.value),
              })
            }
            className="admin-input"
          />
        </Field>
        <Field label="Max advance (days)">
          <input
            type="number"
            value={draft.max_advance_days}
            onChange={(e) =>
              setDraft({
                ...draft,
                max_advance_days: Number(e.target.value),
              })
            }
            className="admin-input"
          />
        </Field>
      </div>

      <div className="mt-5 pt-5 border-t border-outline">
        <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">
          Location options
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {(["video", "in_person"] as const).map((opt) => {
            const selected = draft.location_options.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    location_options: selected
                      ? draft.location_options.filter((o) => o !== opt)
                      : [...draft.location_options, opt],
                  })
                }
                className={[
                  "px-3 py-1.5 rounded text-xs border transition-colors",
                  selected
                    ? "bg-orange/20 text-orange border-orange/40"
                    : "bg-tile text-ink-2 border-outline hover:bg-[#EFE6D4]",
                ].join(" ")}
              >
                {opt === "video" ? "Video" : "In person"}
              </button>
            );
          })}
        </div>
        {draft.location_options.includes("in_person") ? (
          <Field label="Default in-person address (blank = ask attendee)">
            <input
              value={draft.default_in_person_address}
              onChange={(e) =>
                setDraft({ ...draft, default_in_person_address: e.target.value })
              }
              placeholder="e.g. 380 Portage Ave, Palo Alto, CA"
              className="admin-input"
            />
          </Field>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>

      <style jsx>{`
        :global(.admin-input) {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 8px 10px;
          color: #faf6ee;
          font-size: 14px;
        }
        :global(.admin-input:focus) {
          outline: none;
          border-color: #C0703C;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Blackouts ────────────────────────────────────────────────────

function BlackoutsTab({
  blackouts,
  types,
  onChanged,
}: {
  blackouts: Blackout[];
  types: MeetingType[];
  onChanged: (updated: Blackout[]) => void;
}) {
  const [draft, setDraft] = useState({
    start_date: "",
    end_date: "",
    reason: "",
    meeting_type_ids: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function create() {
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch("/api/admin/meet/blackouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          reason: draft.reason || undefined,
          meeting_type_ids:
            draft.meeting_type_ids.length > 0
              ? draft.meeting_type_ids
              : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error ?? "Add failed");
        return;
      }
      onChanged([...blackouts, data.blackout]);
      setDraft({
        start_date: "",
        end_date: "",
        reason: "",
        meeting_type_ids: [],
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this blackout?")) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/meet/blackouts/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        alert("Delete failed");
        return;
      }
      onChanged(blackouts.filter((b) => b.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border-[1.5px] border-outline bg-tile p-5">
        <h2 className="text-lg font-semibold mb-4">Add a blackout</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Start date">
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) =>
                setDraft({ ...draft, start_date: e.target.value })
              }
              className="admin-input"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) =>
                setDraft({ ...draft, end_date: e.target.value })
              }
              className="admin-input"
            />
          </Field>
          <Field label="Reason (optional)">
            <input
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className="admin-input"
              placeholder="Out of office"
            />
          </Field>
        </div>
        <div className="mt-4">
          <span className="block text-xs text-zinc-500 uppercase tracking-widest mb-2">
            Applies to (none selected = all types)
          </span>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => {
              const selected = draft.meeting_type_ids.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      meeting_type_ids: selected
                        ? draft.meeting_type_ids.filter((i) => i !== t.id)
                        : [...draft.meeting_type_ids, t.id],
                    })
                  }
                  className={[
                    "px-3 py-1 rounded-full text-xs border transition-colors",
                    selected
                      ? "bg-orange/20 text-orange border-orange/40"
                      : "bg-tile text-ink-2 border-outline hover:bg-[#EFE6D4]",
                  ].join(" ")}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-expense">{err}</p>}
        <button
          type="button"
          disabled={saving || !draft.start_date || !draft.end_date}
          onClick={create}
          className="mt-5 bg-orange hover:bg-orange-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add blackout"}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Current blackouts</h2>
        {blackouts.length === 0 ? (
          <p className="text-zinc-500 text-sm">No blackouts set.</p>
        ) : (
          <ul className="space-y-2">
            {blackouts.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-lg border-[1.5px] border-outline bg-tile px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-ink-1">
                    {b.start_date} → {b.end_date}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {b.reason ?? "no reason"}
                    {b.meeting_type_ids && b.meeting_type_ids.length > 0
                      ? ` · ${b.meeting_type_ids.length} type(s)`
                      : " · all types"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy === b.id}
                  onClick={() => remove(b.id)}
                  className="text-xs text-expense hover:text-expense transition-colors disabled:opacity-50"
                >
                  {busy === b.id ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
