import Link from "next/link";
import { getNeedsYou, type NeedsYouTask, type NeedsYouTouch } from "@/lib/admin/rail/needs-you";

/**
 * Needs-you shelf: the compact action twin. Overdue tasks, due-today, and the
 * next overdue fundraising touch — each row links into its module. Warm-RAG:
 * dot + label + weight, so the state reads in grayscale (never hue alone).
 */
export default async function NeedsYouShelf() {
  let data;
  try {
    data = await getNeedsYou();
  } catch {
    data = { overdue: [], today: [], nextTouch: null as NeedsYouTouch | null };
  }

  const { overdue, today, nextTouch } = data;
  const empty = overdue.length === 0 && today.length === 0 && !nextTouch;

  return (
    <section className="px-5 py-5 border-t border-hairline">
      <h2 className="flex items-center gap-2 text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-ink-3 mb-2">
        <span className="w-[3px] h-3 rounded-full bg-orange" aria-hidden />
        Needs you
      </h2>

      {empty ? (
        <p className="text-[13px] text-ink-3 py-1">You&rsquo;re clear — nothing overdue or due today.</p>
      ) : (
        <ul>
          {overdue.map((t) => (
            <TaskRow key={t.id} task={t} dot="bg-status-critical" weightClass="text-status-critical-text" />
          ))}
          {today.map((t) => (
            <TaskRow key={t.id} task={t} dot="bg-status-due" weightClass="text-ink-2" />
          ))}
          {nextTouch && (
            <li>
              <Link
                href={nextTouch.href}
                className="group flex items-center gap-3 py-2.5 border-b border-hairline last:border-b-0 -mx-1 px-1 rounded-md hover:bg-tile transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-status-neutral flex-shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink-1 truncate">Next touch: {nextTouch.name}</span>
                  <span className="block text-[11px] text-ink-3 truncate">{nextTouch.action}</span>
                </span>
                {nextTouch.weight && (
                  <span className="text-[12px] text-ink-2 flex-shrink-0 [font-variant-numeric:tabular-nums]">
                    {nextTouch.weight}
                  </span>
                )}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function TaskRow({
  task,
  dot,
  weightClass,
}: {
  task: NeedsYouTask;
  dot: string;
  weightClass: string;
}) {
  return (
    <li>
      <Link
        href={task.href}
        className="group flex items-center gap-3 py-2.5 border-b border-hairline last:border-b-0 -mx-1 px-1 rounded-md hover:bg-tile transition-colors"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden />
        <span
          className={`min-w-0 flex-1 text-[13px] truncate ${
            task.bucket === "overdue" ? "text-ink-1 font-semibold" : "text-ink-1"
          }`}
        >
          {task.title}
        </span>
        {task.weight && (
          <span className={`text-[12px] flex-shrink-0 [font-variant-numeric:tabular-nums] ${weightClass}`}>
            {task.weight}
          </span>
        )}
      </Link>
    </li>
  );
}
