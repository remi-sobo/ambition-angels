import type { ReactNode } from "react";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * The next-step bar at the top of a record (spec §2 principle 1 "Next step
 * first", §5 Detail: "A next-step bar"; Donor.dc.html).
 *
 *   NEXT STEP
 *   Send year-end ask.  12 days late.          [Mark done] [Reschedule] [Change]
 *   Was due Nov 9. Owner: Remi. For the Year-end ask, $25,000.
 *
 * Late steps say how late in danger text and get a danger edge; the state is
 * in the words, never in color alone. No step yet renders the empty form
 * ("No next step yet") with the action that adds one.
 *
 * Up to three actions, passed as nodes: put the lead one first and make it
 * <Button variant="strong">, the rest secondary. The page's accent primary
 * stays in the header (accent discipline).
 */
type Actions = [ReactNode] | [ReactNode, ReactNode] | [ReactNode, ReactNode, ReactNode];

export default function NextStepBar({
  title,
  due,
  meta,
  actions,
  label = "Next step",
}: {
  /** The step, as a sentence: "Send year-end ask." Null when there is none. */
  title: string | null;
  /** When it is due. `late` text is the lateness ("12 days late."). */
  due?: { text: string; late?: boolean };
  /** One line of context: was due, owner, what it is for. */
  meta?: ReactNode;
  actions?: Actions;
  label?: string;
}) {
  const late = !!due?.late;
  return (
    <section
      aria-label={label}
      className="relative flex flex-wrap items-center gap-x-6 gap-y-4 pl-7 pr-6 py-5 mb-4 bg-surface border border-outline rounded-panel overflow-hidden"
    >
      {/* The edge: danger when late, the strong border otherwise. */}
      <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${late ? "bg-status-critical-text" : "bg-outline"}`} />
      <div className="flex-[1_1_420px] min-w-0">
        <div className={TYPE.sectionHeader}>{label}</div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1 font-heading text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ink-1">
          {title ? <span>{title}</span> : <span className="text-ink-2">No next step yet.</span>}
          {due ? <span className={late ? "text-status-critical-text" : "text-ink-2"}>{due.text}</span> : null}
        </div>
        {meta ? <div className={`${TYPE.bodyMuted} text-[13px] mt-1`}>{meta}</div> : null}
      </div>
      {actions && actions.length > 0 ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
