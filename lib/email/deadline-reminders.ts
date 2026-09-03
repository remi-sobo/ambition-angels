/**
 * Pure builder for the daily deadline reminder (app/api/cron/daily-reminders).
 *
 * Takes rows that were ALREADY read with an org fence and builds one org's
 * email. It re-checks org_id on every row anyway: the service-role client
 * bypasses RLS, so this is the last line that keeps one tenant's grants,
 * compliance filings and pipeline out of another tenant's inbox. A row from
 * another org is dropped, never rendered. No I/O, so it is unit-testable
 * (tests/operator-email-scope.test.ts).
 */

export type OrgRow = { org_id: string };

export type ReminderRequirement = OrgRow & {
  id: string;
  kind: string;
  label: string | null;
  due_date: string;
  grant: { name: string } | { name: string }[] | null;
};

export type ReminderMove = OrgRow & {
  id: string;
  name: string | null;
  next_step: string | null;
  next_step_due: string;
  ask_amount: number | null;
  constituent:
    | { first_name: string | null; last_name: string | null; org_name: string | null; type: string }
    | { first_name: string | null; last_name: string | null; org_name: string | null; type: string }[]
    | null;
};

export type ReminderCompliance = OrgRow & {
  id: string;
  title: string;
  jurisdiction: string | null;
  due_date: string;
};

export type DeadlineReminderInput = {
  due: ReminderRequirement[];
  overdue: ReminderRequirement[];
  moves: ReminderMove[];
  compDue: ReminderCompliance[];
  compOverdue: ReminderCompliance[];
};

export type DeadlineReminder = {
  subject: string;
  body: string;
  count: number;
  /** Rows that arrived with a different org_id and were dropped. Always 0 when
   *  the reads were fenced correctly; non-zero means an upstream query leaked. */
  droppedForeignRows: number;
};

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const grantName = (g: ReminderRequirement["grant"]) =>
  (Array.isArray(g) ? g[0]?.name : g?.name) ?? "Unknown grant";

const moveWho = (m: ReminderMove) => {
  const c = Array.isArray(m.constituent) ? m.constituent[0] : m.constituent;
  if (!c) return m.name ?? "Unknown";
  return c.type === "organization"
    ? c.org_name ?? "Unknown org"
    : [c.first_name, c.last_name].filter(Boolean).join(" ") || (m.name ?? "Unknown");
};

function fence<T extends OrgRow>(rows: T[], orgId: string): { kept: T[]; dropped: number } {
  const kept = rows.filter((r) => r.org_id === orgId);
  return { kept, dropped: rows.length - kept.length };
}

/** Build one org's reminder, or null when that org has nothing to say. */
export function buildDeadlineReminder(orgId: string, input: DeadlineReminderInput): DeadlineReminder | null {
  const due = fence(input.due, orgId);
  const overdue = fence(input.overdue, orgId);
  const moves = fence(input.moves, orgId);
  const compDue = fence(input.compDue, orgId);
  const compOverdue = fence(input.compOverdue, orgId);
  const droppedForeignRows =
    due.dropped + overdue.dropped + moves.dropped + compDue.dropped + compOverdue.dropped;

  const count =
    due.kept.length + overdue.kept.length + moves.kept.length + compDue.kept.length + compOverdue.kept.length;
  if (count === 0) return null;

  const reqLine = (r: ReminderRequirement) =>
    `<li><strong>${grantName(r.grant)}</strong> — ${r.label ?? r.kind.replace(/_/g, " ")} · due ${r.due_date}</li>`;
  const compLine = (c: ReminderCompliance) =>
    `<li><strong>${c.title}</strong>${c.jurisdiction && c.jurisdiction !== "—" ? ` (${c.jurisdiction})` : ""} · due ${c.due_date}</li>`;

  let body = "";
  if (compOverdue.kept.length > 0) {
    body += `<p style="color:#DC2626;font-weight:600;">⚠ Overdue compliance filings</p><ul>${compOverdue.kept
      .map(compLine)
      .join("")}</ul>`;
  }
  if (overdue.kept.length > 0) {
    body += `<p style="color:#DC2626;font-weight:600;">⚠ Overdue grant deliverables</p><ul>${overdue.kept
      .map(reqLine)
      .join("")}</ul>`;
  }
  if (due.kept.length > 0 || compDue.kept.length > 0) {
    body += `<p style="font-weight:600;">Coming up</p><ul>${due.kept.map(reqLine).join("")}${compDue.kept
      .map(compLine)
      .join("")}</ul>`;
  }
  if (moves.kept.length > 0) {
    body += `<p style="font-weight:600;">Major-gift moves due</p><ul>${moves.kept
      .map(
        (m) =>
          `<li><strong>${moveWho(m)}</strong>${m.ask_amount ? ` (${fmtUsd(Number(m.ask_amount))})` : ""} — ${m.next_step ?? "next step"} · ${m.next_step_due}</li>`
      )
      .join("")}</ul>`;
  }

  return {
    subject: `⏰ ${count} deadline${count === 1 ? "" : "s"} need attention`,
    body,
    count,
    droppedForeignRows,
  };
}
