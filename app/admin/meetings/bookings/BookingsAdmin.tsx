"use client";

import { useState } from "react";
import type { Booking, MeetingType } from "@/lib/database.types";
import { TYPE } from "@/lib/admin/typeScale";

export type BookingWithType = Booking & { meeting_type: MeetingType };

// Upcoming + past bookings from the public booking page, with the admin-side
// cancel action (attendee gets the cancellation email). Cancelling moves the
// row into the past/cancelled list locally so the page reflects it instantly.
export default function BookingsAdmin({
  initialUpcoming,
  initialRecent,
  last30Count,
}: {
  initialUpcoming: BookingWithType[];
  initialRecent: BookingWithType[];
  last30Count: number;
}) {
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [recent, setRecent] = useState(initialRecent);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const upcomingThisWeek = upcoming.filter((b) => {
    const ms = new Date(b.start_time).getTime();
    return ms < Date.now() + 7 * 24 * 3600_000;
  }).length;

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
      const cancelled = upcoming.find((r) => r.id === id);
      setUpcoming((rows) => rows.filter((r) => r.id !== id));
      if (cancelled) {
        setRecent((rows) => [{ ...cancelled, status: "cancelled" as const }, ...rows]);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-8 text-sm">
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="This week" value={upcomingThisWeek} />
        <Stat label="Booked last 30d" value={last30Count} />
      </div>

      <section>
        <h2 className={`${TYPE.sectionTitle} mb-4`}>Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-ink-3 text-sm">Nothing on the books.</p>
        ) : (
          <BookingTable rows={upcoming} busy={busy} onCancel={cancel} canCancel />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest text-ink-3">{label}</div>
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
    <div className="overflow-x-auto rounded-lg border-[1.5px] border-outline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-ink-3 border-b border-outline">
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
                <div className="text-xs text-ink-3">{r.attendee_email}</div>
              </td>
              <td className="px-4 py-3 text-ink-2">{r.attendee_role ?? "—"}</td>
              <td className="px-4 py-3">
                <StatusPill status={r.status} />
              </td>
              {canCancel && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => onCancel?.(r.id)}
                    className="text-xs text-orange hover:text-orange-dark transition-colors disabled:opacity-50"
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
    no_show: "bg-status-watch-bg text-status-watch-text border-status-watch/40",
    completed: "bg-tile text-ink-2 border-outline",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
