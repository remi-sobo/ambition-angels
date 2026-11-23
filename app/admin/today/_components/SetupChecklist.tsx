import Link from "next/link";
import type { ChecklistView } from "@/lib/admin/setupChecklist";
import ReportProblemButton from "@/app/admin/_components/ReportProblemButton";
import { FinishLaterButton, TalkToLogLink } from "./SetupChecklistControls";

// V4 Stage F: the five-step setup panel on Today (Setup.dc.html), for
// owners and admins until every step is done or "Finish later" is pressed.
// Each step's state comes from real data (lib/admin/setupChecklist.ts).

const actionCls =
  "inline-flex min-h-[44px] items-center justify-center rounded-control border border-outline bg-surface px-4 text-sm font-semibold text-ink-1 hover:bg-tile";
const altCls = "inline-flex min-h-[44px] items-center text-sm font-semibold text-orange hover:text-orange-dark";

export default function SetupChecklist({ view, supportEmail }: { view: ChecklistView; supportEmail: string | null }) {
  const nextKey = view.steps.find((s) => !s.done)?.key;
  return (
    <section aria-labelledby="setup-h" className="mb-4 rounded-panel border border-hairline bg-surface" data-testid="setup-checklist">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id="setup-h" className="text-[17px] font-semibold text-ink-1">Get ready to work</h2>
          <p className="text-sm text-ink-2 mt-0.5">
            <strong className="font-semibold text-ink-1">
              {view.doneCount} of {view.total} done.
            </strong>{" "}
            About {view.minutesLeft} minutes left. Nothing goes out to a donor until you send it.
          </p>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={view.total}
            aria-valuenow={view.doneCount}
            className="mt-2 flex gap-1 w-full max-w-[240px]"
          >
            {view.steps.map((s) => (
              <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-revenue" : "bg-tile border border-hairline"}`} />
            ))}
          </div>
        </div>
        <FinishLaterButton />
      </div>

      <ol className="mt-4 divide-y divide-outline border-t border-hairline">
        {view.steps.map((s) => (
          <li key={s.key} className="flex flex-col sm:flex-row sm:items-start gap-3 px-5 py-4">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done ? "bg-revenue-bg text-revenue" : "border border-outline text-ink-2"
              }`}
            >
              {s.done ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              ) : (
                s.n
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink-1">{s.title}</h3>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    s.done ? "bg-revenue-bg text-revenue" : "bg-tile text-ink-2"
                  }`}
                >
                  {s.done ? (s.notNeeded ? "Not needed" : "Done") : `Not started · about ${s.minutes} min`}
                </span>
              </div>
              <p className="text-sm text-ink-2 mt-0.5">{s.why}</p>
              {s.detail ? <p className="text-sm text-ink-1 mt-1">{s.detail}</p> : null}
            </div>
            {!s.notNeeded ? (
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {s.action.href === "#capture" ? (
                  <TalkToLogLink label={s.action.label} className={actionCls} />
                ) : (
                  <Link href={s.action.href} className={s.key === nextKey ? `${actionCls} border-ink-1` : actionCls}>
                    {s.action.label}
                  </Link>
                )}
                {s.alt && !s.done ? <TalkToLogLink label={s.alt.label} className={altCls} /> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-hairline px-5 py-4">
        <p className="text-sm text-ink-2 flex-1">
          Do them in any order. This list stays on Home until all five are done.
          {supportEmail ? (
            <>
              {" "}
              Need a hand? Write to <span className="font-semibold text-ink-1 select-all">{supportEmail}</span>.
            </>
          ) : (
            " Need a hand? Tell us here."
          )}
        </p>
        <ReportProblemButton variant="quiet" label="Report a problem" />
      </div>
    </section>
  );
}
