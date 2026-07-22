import type { Booking, MeetingType } from "@/lib/database.types";

export type BookingWithType = Booking & { meeting_type: MeetingType | null };

// Past + cancelled bookings, collapsed by default — the record of what came
// through the booking page. Live upcoming bookings show (badged, cancellable)
// in the Overview's Upcoming list, so this is history only: server-rendered,
// no client state.
export default function BookingHistory({
  rows,
  last30Count,
}: {
  rows: BookingWithType[];
  last30Count: number;
}) {
  return (
    <section>
      <details className="group">
        <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink-1 transition-colors">
          <svg viewBox="0 0 16 16" className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Booking history ({rows.length}) · {last30Count} booked in the last 30 days
        </summary>
        <div className="mt-3">
          {rows.length === 0 ? (
            <p className="text-ink-3 text-sm">No past or cancelled bookings yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border-[1.5px] border-outline bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-ink-3 border-b border-outline">
                    <th className="px-4 py-3 font-medium">When (PT)</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Attendee</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateTime(new Date(r.start_time))}
                      </td>
                      <td className="px-4 py-3">{r.meeting_type?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-ink-1">{r.attendee_name}</div>
                        <div className="text-xs text-ink-3">{r.attendee_email}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-2">{r.attendee_role ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </section>
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
