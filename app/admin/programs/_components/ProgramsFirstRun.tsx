import type { ReactNode } from "react";
import EmptyState from "@/app/admin/_components/EmptyState";
import { ButtonLink } from "@/app/admin/_components/ui/Button";

/**
 * The Programs first-run state (V4 Stage E, SetupEmpty.dc.html): for an org
 * with no participants or no cohorts yet. It sits inside the list frame (the
 * table header ghosts behind it on desktop), says what the place is for,
 * offers the two ways to fill it, and says what happens next.
 */
const PEOPLE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
  </svg>
);

export function ProgramsFirstRun({
  kind,
  terms,
  addOne,
  orgName,
  headers,
}: {
  kind: "people" | "cohorts";
  terms: { student: string; students: string; cohort: string; cohorts: string };
  /** The "add one" control (the page's own create form). */
  addOne: ReactNode;
  orgName?: string | null;
  /** Column headers ghosted behind the panel on desktop. */
  headers: string[];
}) {
  const people = terms.students.toLowerCase();
  const cohort = terms.cohort.toLowerCase();
  return (
    <section aria-labelledby="programs-first-run" className="bg-surface border border-hairline rounded-panel-lg overflow-hidden">
      <div aria-hidden className="hidden sm:grid border-b border-hairline px-5 py-3 text-xs uppercase tracking-wider text-ink-3" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {kind === "people" ? (
        <EmptyState
          label={people}
          title={`Your ${people} will live here`}
          icon={PEOPLE_ICON}
          purpose={`One list of everyone in ${orgName ?? "your programs"}: which ${terms.cohorts.toLowerCase()} they are in, how often they come, and what to do next for each one.`}
          primaryAction={<ButtonLink href="/admin/settings/imports/csv" variant="primary">Import a spreadsheet</ButtonLink>}
          primaryHint={`CSV, up to 2,000 rows. Add a ${cohort} column to enroll everyone at once.`}
          secondaryAction={addOne}
          secondaryHint={`Type in one ${terms.student.toLowerCase()}.`}
          next="you match your columns to ours, we flag possible duplicates, and you see a preview. Nothing is saved until you confirm."
        />
      ) : (
        <EmptyState
          label={terms.cohorts.toLowerCase()}
          title={`Your ${terms.cohorts.toLowerCase()} will live here`}
          icon={PEOPLE_ICON}
          purpose={`A ${cohort} is a group that meets: its ${people}, its sessions and its attendance, in one place. Create one, then add people and take attendance from your phone.`}
          primaryAction={addOne}
          primaryHint={`Name it, add dates. You can add people right after.`}
          secondaryAction={
            <ButtonLink href="/admin/settings/imports/csv" variant="secondary">
              Import a roster file
            </ButtonLink>
          }
          secondaryHint={`Have a list? Import it with a ${cohort} column, or put everyone in one ${cohort}.`}
          next={`select ${people} on the People list and choose Enroll in ${cohort}, or open the ${cohort} and take attendance from its next session.`}
        />
      )}
    </section>
  );
}
