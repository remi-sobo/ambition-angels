// Change timeline for a record, rendered from audit_log events (fetched
// server-side via lib/admin/history.ts). Same panel shape as EntityTasks /
// EntityDocuments so profile pages compose uniformly. Server component —
// history is read-only.

import { TYPE } from "@/lib/admin/typeScale";
import type { HistoryEvent } from "@/lib/admin/history";

// Friendly labels for known governance actions; anything else falls back to
// the humanized last segment ("board.member.update" → "Updated").
const ACTION_LABELS: Record<string, string> = {
  "board.member.create": "Added to the board",
  "board.member.update": "Details updated",
  "board.member.coi_recorded": "COI disclosure recorded",
  "board.member.delete": "Removed from roster",
  "compliance.item.create": "Deadline created",
  "compliance.item.update": "Details updated",
  "compliance.item.filed": "Marked filed",
  "compliance.item.delete": "Deleted",
  "program.student.create": "Added to the roster",
  "program.student.update": "Details updated",
  "program.student.stage": "Stage changed",
  "program.student.delete": "Removed from roster",
  "program.attendance.record": "Attendance recorded",
};

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const verb = action.split(".").pop() ?? action;
  const words = verb.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Compact "what changed" summary from the recorded patch. Scalars render as
// field: value; nested values (checklist, agenda) collapse to the field name.
function changeSummary(after: Record<string, unknown> | null): string {
  if (!after) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (parts.length === 4) {
      parts.push("…");
      break;
    }
    const label = key.replace(/_/g, " ");
    if (value === null || value === "") parts.push(`${label} cleared`);
    else if (typeof value === "object") parts.push(label);
    else {
      const s = String(value);
      parts.push(`${label}: ${s.length > 60 ? s.slice(0, 57) + "…" : s}`);
    }
  }
  return parts.join(" · ");
}

const fmtWhen = (ts: string) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function EntityHistory({ events }: { events: HistoryEvent[] }) {
  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline">
        <h2 className={TYPE.cardTitle}>History</h2>
      </div>
      {events.length === 0 ? (
        <p className={`p-6 ${TYPE.bodyMuted}`}>
          No changes recorded yet. Every edit from here on lands in this timeline.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {events.map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm flex items-start gap-4">
              <span className="text-xs text-ink-2 w-24 flex-shrink-0 pt-px tabular-nums">
                {fmtWhen(e.ts)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-ink-1 font-medium">{actionLabel(e.action)}</span>
                {e.actorName && <span className="text-xs text-ink-3"> — {e.actorName}</span>}
                {changeSummary(e.after) && (
                  <p className="text-xs text-ink-2 mt-0.5 break-words">{changeSummary(e.after)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
