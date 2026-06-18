import { getSchedule } from "@/lib/admin/overview/sources";
import { Widget, Empty } from "./shared";

// Schedule — upcoming meetings from the connected Google Calendar (next two
// weeks). Because /meet bookings are written to that same calendar, they show
// up here too. Degrades to the bookings table if Calendar isn't configured.

const dayKey = (iso: string) => iso.slice(0, 10);

const fmtDay = (iso: string) => {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (dayKey(d.toISOString()) === dayKey(today.toISOString())) return "Today";
  if (dayKey(d.toISOString()) === dayKey(tomorrow.toISOString())) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const fmtTime = (iso: string, allDay: boolean) =>
  allDay ? "All day" : new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default async function ScheduleWidget({ className }: { className?: string }) {
  const { items, source } = await getSchedule();

  // Group consecutive items by day for a calendar-like read.
  let lastDay = "";

  return (
    <Widget title="Schedule" href="/meet" hrefLabel="Scheduler" className={className}>
      {items.length === 0 ? (
        <Empty>Nothing on the calendar for the next two weeks.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e) => {
            const day = fmtDay(e.start);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <li key={e.id}>
                {showDay && <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mt-3 first:mt-0 mb-1">{day}</div>}
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] text-ink-2 [font-variant-numeric:tabular-nums] w-16 flex-shrink-0">
                    {fmtTime(e.start, e.allDay)}
                  </span>
                  <span className="text-sm text-ink-1 font-medium truncate min-w-0">{e.title}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {source === "bookings" && (
        <p className="mt-4 text-[11px] text-ink-3">
          Showing /meet bookings — connect Google Calendar (GOOGLE_CALENDAR_ID) to see your full schedule.
        </p>
      )}
    </Widget>
  );
}
