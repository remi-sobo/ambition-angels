import { getStatusLine, getChangeSince, type StatusLevel } from "@/lib/admin/statusLine";
import { getOutlook } from "@/lib/admin/outlookRead";
import OutlookPanel from "./OutlookPanel";
import ExplainWithReed from "./ExplainWithReed";

// Status & Outlook — the Command Center status line, the "changed since you
// were last here" diff, and the 30/60/90 outlook chips (spec #5).
// Deterministic rules over the spine's canonical reads (finance snapshot,
// revenue schedule, v_action_items, metric catalog); no LLM anywhere. Reed
// narrates this surface in a later spec — Reed does not decide.

const LEVEL_STYLE: Record<StatusLevel, { dot: string; text: string }> = {
  critical: { dot: "bg-status-critical", text: "text-status-critical-text" },
  watch: { dot: "bg-status-watch", text: "text-status-watch-text" },
  steady: { dot: "bg-status-healthy", text: "text-status-healthy" },
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default async function StatusLineCard() {
  let statusLine, change, outlook;
  try {
    [statusLine, change, outlook] = await Promise.all([getStatusLine(), getChangeSince(), getOutlook()]);
  } catch {
    return null; // never let the status line break the Command Center
  }

  const style = LEVEL_STYLE[statusLine.level];

  const deltas: string[] = [];
  if (change?.since) {
    if (change.giftsCount > 0)
      deltas.push(`${change.giftsCount} gift${change.giftsCount === 1 ? "" : "s"} in (${usd(change.giftsTotal)})`);
    if (change.tasksCompleted > 0) deltas.push(`${change.tasksCompleted} task${change.tasksCompleted === 1 ? "" : "s"} completed`);
    if (change.tasksCreated > 0) deltas.push(`${change.tasksCreated} new task${change.tasksCreated === 1 ? "" : "s"}`);
    if (change.reconProposals > 0) deltas.push(`${change.reconProposals} reconcile proposal${change.reconProposals === 1 ? "" : "s"}`);
  }

  return (
    <section className="rounded-card-lg border-[1.5px] border-outline bg-surface shadow-panel px-5 py-4">
      <p className="flex items-center gap-2.5 text-sm font-semibold">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dot}`} />
        <span className={style.text}>{statusLine.line}</span>
        <span className="ml-auto font-normal">
          <ExplainWithReed
            surface="status_line"
            question={`Why is the status "${statusLine.level}" today? Walk me through each condition behind it and what would change the level.`}
          />
        </span>
      </p>
      {change?.since && (
        <p className="mt-1.5 pl-5 text-xs text-ink-2">
          Since you were last here ({timeAgo(change.since)}):{" "}
          {deltas.length > 0 ? deltas.join(" · ") : "no changes."}
        </p>
      )}
      {outlook && <OutlookPanel outlook={outlook} />}
    </section>
  );
}
