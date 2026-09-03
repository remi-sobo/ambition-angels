import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { selectOperatorRecipients, type AllowlistRow } from "../lib/email/operator";
import {
  buildDeadlineReminder,
  type ReminderCompliance,
  type ReminderMove,
  type ReminderRequirement,
} from "../lib/email/deadline-reminders";

/**
 * Cross-tenant operator-email guard.
 *
 * org_email_allowlist holds every tenant's operators side by side, and the
 * cron jobs read tenant tables through the service-role client (no RLS). An
 * unscoped roster + unscoped reads once produced, in code, one daily email
 * that would have sent Ambition Angels' grants, compliance filings and
 * fundraising pipeline to the admins of three other organizations, one of
 * them an external client. Two unrelated outages are the only reason it never
 * shipped. These tests make the fence a build failure rather than a habit.
 */

const AA = "org-aa";
const YGB = "org-ygb";
const SAFE = "org-safespace";

const ALLOWLIST: AllowlistRow[] = [
  { email: "remi@ambitionangels.org", role: "owner", org_id: AA },
  { email: "shannon@ambitionangels.org", role: "admin", org_id: AA },
  { email: "Remi@AmbitionAngels.org", role: "owner", org_id: AA }, // case duplicate
  { email: "alicia@ygbpeninsula.org", role: "staff", org_id: YGB },
  { email: "denise@ygbpeninsula.org", role: "admin", org_id: YGB },
  { email: "susan@safespace.org", role: "admin", org_id: SAFE },
  { email: "jasmine@safespace.org", role: "staff", org_id: SAFE },
];

describe("operator recipient roster is per-org", () => {
  test("only the named org's owner/admin addresses, deduped", () => {
    expect(selectOperatorRecipients(ALLOWLIST, AA)).toEqual([
      "remi@ambitionangels.org",
      "shannon@ambitionangels.org",
    ]);
    expect(selectOperatorRecipients(ALLOWLIST, YGB)).toEqual(["denise@ygbpeninsula.org"]);
    expect(selectOperatorRecipients(ALLOWLIST, SAFE)).toEqual(["susan@safespace.org"]);
  });

  test("no address outside the org ever appears, whatever the roster holds", () => {
    for (const org of [AA, YGB, SAFE]) {
      const recipients = selectOperatorRecipients(ALLOWLIST, org);
      const foreign = ALLOWLIST.filter((r) => r.org_id !== org).map((r) => r.email.toLowerCase());
      for (const email of recipients) expect(foreign).not.toContain(email.toLowerCase());
    }
    expect(selectOperatorRecipients(ALLOWLIST, "org-unknown")).toEqual([]);
  });

  test("staff/finance roles are never operators", () => {
    expect(selectOperatorRecipients(ALLOWLIST, YGB)).not.toContain("alicia@ygbpeninsula.org");
  });
});

describe("daily deadline reminder body is fenced to one org", () => {
  const req = (org: string, grant: string, label: string): ReminderRequirement => ({
    id: `${org}-${label}`,
    org_id: org,
    kind: "application",
    label,
    due_date: "2026-07-31",
    grant: { name: grant },
  });
  const comp = (org: string, title: string): ReminderCompliance => ({
    id: `${org}-${title}`,
    org_id: org,
    title,
    jurisdiction: "CA",
    due_date: "2026-07-31",
  });
  const move = (org: string, who: string, ask: number): ReminderMove => ({
    id: `${org}-${who}`,
    org_id: org,
    name: who,
    next_step: "Call",
    next_step_due: "2026-08-15",
    ask_amount: ask,
    constituent: { first_name: who, last_name: null, org_name: null, type: "person" },
  });

  // Mixed-org input, the shape an unscoped query would have returned.
  const mixed = {
    due: [req(AA, "Twilio Tech Innovation Grant", "AA application")],
    overdue: [req(AA, "Bella", "AA overdue"), req(YGB, "Peninsula Fund", "YGB overdue")],
    moves: [move(AA, "Lawrence", 50_000), move(SAFE, "Rivera", 12_000)],
    compDue: [comp(YGB, "YGB Form 199")],
    compOverdue: [comp(AA, "Form 941 — quarterly payroll taxes"), comp(YGB, "YGB DE-9")],
  };

  test("AA's email carries only AA rows and drops the rest", () => {
    const r = buildDeadlineReminder(AA, mixed);
    expect(r).not.toBeNull();
    expect(r!.count).toBe(4); // 1 due + 1 overdue + 1 move + 1 compliance overdue
    expect(r!.droppedForeignRows).toBe(4);
    for (const s of ["Twilio", "Bella", "Lawrence", "Form 941"]) expect(r!.body).toContain(s);
    for (const s of ["Peninsula Fund", "YGB", "Rivera", "12,000", "DE-9", "Form 199"]) {
      expect(r!.body).not.toContain(s);
    }
    expect(r!.subject).toBe("⏰ 4 deadlines need attention");
  });

  test("another org's email contains none of AA's pipeline", () => {
    const r = buildDeadlineReminder(SAFE, mixed);
    expect(r).not.toBeNull();
    expect(r!.count).toBe(1);
    expect(r!.body).toContain("Rivera");
    for (const s of ["Lawrence", "50,000", "Bella", "Twilio", "Form 941", "YGB"]) {
      expect(r!.body).not.toContain(s);
    }
  });

  test("an org with nothing due gets no email at all", () => {
    expect(buildDeadlineReminder("org-younglife", mixed)).toBeNull();
  });
});

describe("every operator-email call site passes an org", () => {
  // Static ratchet: getOperatorEmails / sendOperatorEmail take the org as
  // their first argument. A zero-argument call is the exact bug this guards.
  const REPO = join(__dirname, "..");
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(abs));
      else if (/\.tsx?$/.test(e.name)) out.push(abs);
    }
    return out;
  }
  test("no zero-argument getOperatorEmails() / sendOperatorEmail() anywhere in app/ or lib/", () => {
    const offenders: string[] = [];
    for (const root of ["app", "lib"]) {
      for (const abs of walk(join(REPO, root))) {
        const rel = relative(REPO, abs);
        if (rel === join("lib", "email", "operator.ts")) continue;
        const src = readFileSync(abs, "utf8");
        const re = /\b(getOperatorEmails|sendOperatorEmail)\(\s*\)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          offenders.push(`${rel}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
