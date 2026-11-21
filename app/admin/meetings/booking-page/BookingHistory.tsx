import type { Booking, MeetingType } from "@/lib/database.types";
import DataTable, { type DataTableColumn } from "@/app/admin/_components/ui/DataTable";
import Badge, { type BadgeTone } from "@/app/admin/_components/ui/Badge";

export type BookingWithType = Booking & { meeting_type: MeetingType | null };

// Past + cancelled bookings, collapsed by default — the record of what came
// through the booking page. Live upcoming bookings show (badged, cancellable)
// in the Overview's Upcoming list, so this is history only: server-rendered,
// no client state. V4 Stage G: the kit DataTable (phone cards included).
const TONE: Record<Booking["status"], BadgeTone> = {
  confirmed: "success",
  cancelled: "danger",
  no_show: "warning",
  completed: "neutral",
};
const LABEL: Record<Booking["status"], string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  no_show: "No show",
  completed: "Completed",
};

export default function BookingHistory({ rows, last30Count }: { rows: BookingWithType[]; last30Count: number }) {
  const columns: DataTableColumn<BookingWithType>[] = [
    {
      key: "attendee",
      header: "Attendee",
      card: "title",
      render: (r) => (
        <>
          <span className="block text-ink-1 font-semibold">{r.attendee_name}</span>
          <span className="block text-xs text-ink-3">{r.attendee_email}</span>
        </>
      ),
    },
    { key: "when", header: "When (PT)", className: "whitespace-nowrap tabular-nums", render: (r) => formatDateTime(new Date(r.start_time)) },
    { key: "type", header: "Type", render: (r) => r.meeting_type?.name ?? <span className="text-ink-3">No type</span> },
    { key: "role", header: "Role", className: "text-ink-2", render: (r) => r.attendee_role ?? <span className="text-ink-3">Not given</span> },
    { key: "status", header: "Status", render: (r) => <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge> },
  ];
  return (
    <section>
      <details className="group">
        <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-xs text-ink-3 hover:text-ink-1 transition-colors">
          <svg viewBox="0 0 16 16" className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Booking history ({rows.length}) · {last30Count} booked in the last 30 days
        </summary>
        <div className="mt-3">
          <DataTable
            label="Booking history"
            noun={{ one: "booking", many: "bookings" }}
            columns={columns}
            data={{ rows, total: rows.length, page: 0, pageSize: Math.max(rows.length, 1) }}
            getRowId={(r) => r.id}
            getRowLabel={(r) => r.attendee_name}
            spec={{ sortable: [], defaultSort: null, pageSize: Math.max(rows.length, 1) }}
            state={{ page: 0, sort: null }}
            baseHref="/admin/settings/organization/booking-page"
            emptyMessage="No past or cancelled bookings yet."
          />
        </div>
      </details>
    </section>
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
