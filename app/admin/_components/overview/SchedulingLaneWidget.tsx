import { getSchedulingLane } from "@/lib/admin/overview/sources";
import { Widget, Empty } from "./shared";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Scheduling lane — upcoming confirmed bookings. (Email-sourced candidates to
// schedule fold in as that pipeline is wired.)

export default async function SchedulingLaneWidget({ className }: { className?: string }) {
  const bookings = await getSchedulingLane();

  return (
    <Widget title="Scheduling lane" href="/meet" hrefLabel="Scheduler" className={className}>
      {bookings.length === 0 ? (
        <Empty>No upcoming meetings on the books.</Empty>
      ) : (
        <ul className="divide-y divide-hairline -my-1">
          {bookings.map((b) => (
            <li key={b.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm text-ink-1 font-medium truncate block">{b.name}</span>
                <span className="text-[11px] text-ink-2 truncate">{b.type}</span>
              </div>
              <span className="text-[11px] text-ink-3 whitespace-nowrap">{fmtWhen(b.start)}</span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
