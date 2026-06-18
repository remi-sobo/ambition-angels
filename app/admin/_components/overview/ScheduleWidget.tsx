import { getSchedule } from "@/lib/admin/overview/sources";
import { Widget, Empty } from "./shared";

// Schedule — upcoming meetings from the connected Google Calendar.
//
// This renders on the server (which runs in UTC), so every time/day MUST be
// formatted with an explicit `timeZone` (the calendar's own). Without it, a 3pm
// Pacific event prints as 10pm and evening events spill into the next day.
// Intl with an explicit timeZone is deterministic, so server and client agree.

const ymdInTz = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const labelForKey = (key: string, tz: string) =>
  // Noon-UTC anchor avoids day-boundary slips when formatting the date in tz.
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(key + "T12:00:00Z")
  );

const fmtTime = (iso: string, allDay: boolean, tz: string) =>
  allDay ? "All day" : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default async function ScheduleWidget({ className }: { className?: string }) {
  const { items, source, timeZone } = await getSchedule();

  const now = new Date();
  const todayKey = ymdInTz(now, timeZone);
  const tomorrowKey = ymdInTz(new Date(now.getTime() + 86400000), timeZone);
  const dayKeyOf = (e: { start: string; allDay: boolean }) =>
    e.allDay ? e.start.slice(0, 10) : ymdInTz(new Date(e.start), timeZone);
  const dayLabel = (key: string) => (key === todayKey ? "Today" : key === tomorrowKey ? "Tomorrow" : labelForKey(key, timeZone));

  let lastKey = "";

  return (
    <Widget title="Schedule" href="/meet" hrefLabel="Scheduler" className={className}>
      {items.length === 0 ? (
        <Empty>Nothing on the calendar for the next two weeks.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e) => {
            const key = dayKeyOf(e);
            const showDay = key !== lastKey;
            lastKey = key;
            return (
              <li key={e.id}>
                {showDay && (
                  <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mt-3 first:mt-0 mb-1">
                    {dayLabel(key)}
                  </div>
                )}
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] text-ink-2 [font-variant-numeric:tabular-nums] w-16 flex-shrink-0">
                    {fmtTime(e.start, e.allDay, timeZone)}
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
