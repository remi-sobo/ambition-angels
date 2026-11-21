/**
 * V4 Stage C (spec §7): which panels Today shows, chosen by PERMISSION and
 * filled by ASSIGNMENT. PURE: the page passes the role's permission list and
 * the org's entitlements; tests pass fixtures (tests/today-panels.test.ts).
 *
 * No new roles (spec §3). The layout is read from permissions, never from a
 * role name, so a role change stays a data change:
 *
 *   lead      org.manage (owner, admin): mine and overdue, money at a glance,
 *             a thin my-day strip; below, donors who need me and team this week
 *   finance   finance.write without org.manage: uncategorized transactions and
 *             bills due, money at a glance, my day; below, anything owned
 *   staff     any other write permission: mine, my day; below, my donors
 *             (fundraising) and/or my cohorts (program), by what is assigned
 *   readonly  no write permission at all (board_viewer): a read-only summary
 *
 * Money only ever appears with modules.finance AND finance.read (the #593
 * rule), and only for the roles the prototype names ("owners and finance
 * only"): staff hold finance.read for the Finance pages but Today stays on
 * their own work.
 */

export type TodayPanelKey =
  | "mine"
  | "money"
  | "myDay"
  | "financeQueue"
  | "donorsNeedMe"
  | "myCohorts"
  | "teamWeek"
  | "boardSummary";

export type TodayLayoutKind = "lead" | "finance" | "staff" | "readonly";

export type TodayLayout = {
  kind: TodayLayoutKind;
  /** The first row: at most three things (Remi's answer 8). */
  top: TodayPanelKey[];
  /** One level down. */
  below: TodayPanelKey[];
  /** The page's primary action: Talk to log with ai.capture, the old quick
   *  add without it, nothing for a read-only role. */
  primary: "talk" | "quick_add" | null;
  readOnly: boolean;
};

export type PanelInput = {
  /** The role's permissions (role_permissions). */
  permissions: Iterable<string>;
  /** The org's entitlements. */
  features: Iterable<string>;
};

const WRITE_PERMS = ["ops.write", "fundraising.write", "program.write", "finance.write", "board.write", "compliance.write"];

export function selectTodayPanels(input: PanelInput): TodayLayout {
  const perms = new Set(input.permissions);
  const feats = new Set(input.features);
  const can = (p: string) => perms.has(p);
  const mod = (m: string) => feats.has(`modules.${m}`);

  const readOnly = !WRITE_PERMS.some(can);
  const kind: TodayLayoutKind = readOnly
    ? "readonly"
    : can("org.manage")
      ? "lead"
      : can("finance.write")
        ? "finance"
        : "staff";

  const money = mod("finance") && can("finance.read") && (kind === "lead" || kind === "finance");
  const donors = mod("fundraising") && can("fundraising.read");
  const cohorts = mod("program") && can("program.read");

  // Capture's tables are personal and need ops.write (capture_tables.sql RLS),
  // so Talk to log is offered only where a recording can actually be saved.
  const primary: TodayLayout["primary"] = readOnly ? null : can("ops.write") ? (feats.has("ai.capture") ? "talk" : "quick_add") : null;

  const top: TodayPanelKey[] = [];
  const below: TodayPanelKey[] = [];

  if (kind === "readonly") {
    top.push("boardSummary");
    if (money) top.push("money");
  } else if (kind === "lead") {
    top.push("mine");
    if (money) top.push("money");
    top.push("myDay");
    if (donors) below.push("donorsNeedMe");
    if (can("ops.read")) below.push("teamWeek");
  } else if (kind === "finance") {
    if (mod("finance") && can("finance.read")) top.push("financeQueue");
    if (money) top.push("money");
    top.push("myDay");
    below.push("mine");
  } else {
    top.push("mine", "myDay");
    if (donors) below.push("donorsNeedMe");
    if (cohorts) below.push("myCohorts");
  }

  return { kind, top, below, primary, readOnly };
}

/** Every panel a layout shows, top then below. */
export function panelsOf(layout: TodayLayout): Set<TodayPanelKey> {
  return new Set([...layout.top, ...layout.below]);
}

// ── "Mine": owner_id first, the old text owner as the fallback ──────────────

export type Me = { userId: string; handle: string | null };

/**
 * Is this row mine? `owner_id` (V4 assignment, add_owner_id_assignment.sql)
 * wins when it is set; only a row with NO owner_id falls back to the older
 * text owner (ops_tasks.assigned_to, opportunities.owner, asks.owner), which
 * holds a first-name handle. So a row reassigned by id to someone else never
 * stays "mine" because of a stale handle.
 */
export function isMine(row: { owner_id?: string | null; owner_text?: string | null }, me: Me): boolean {
  if (row.owner_id) return row.owner_id === me.userId;
  const text = row.owner_text?.trim().toLowerCase();
  return !!text && !!me.handle && text === me.handle.toLowerCase();
}

export type MineItem = {
  id: string;
  kind: "task" | "next_move" | "ask" | "obligation";
  title: string;
  /** "Donor follow-up", "Task", "Ask", ... */
  kindLabel: string;
  context: string | null;
  due: string | null;
  href: string;
  /** One verb for the row's action ("Open", "Review"). */
  action: string;
};

export function dueLabel(due: string | null, today: string): { text: string; tone: "late" | "today" | "soon" | "none" } {
  if (!due) return { text: "No date", tone: "none" };
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} late`, tone: "late" };
  if (days === 0) return { text: "Due today", tone: "today" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `Due in ${days} days`, tone: "soon" };
}

/** Overdue first (most overdue on top), then today, then soonest, then undated. */
export function rankMine<T extends { due: string | null; title: string }>(items: readonly T[], today: string): T[] {
  const bucket = (d: string | null) => (!d ? 3 : d < today ? 0 : d === today ? 1 : 2);
  return [...items].sort((a, b) => {
    const ba = bucket(a.due);
    const bb = bucket(b.due);
    if (ba !== bb) return ba - bb;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

// ── The decision line ───────────────────────────────────────────────────────

export type DecisionInput = {
  layout: TodayLayoutKind;
  mine: { late: number; dueToday: number; first: string | null };
  money?: { runwayMonths: number | null; stale: boolean } | null;
  financeQueue?: { uncategorized: number | null; proposals: number | null } | null;
  donors?: { count: number } | null;
  captureWaiting?: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One sentence in plain words at the top of Today (spec §5 Dashboard: "a
 * decision line in plain words"). It names the one thing to do first, or says
 * plainly that nothing is late. Never jargon, never a bare number.
 */
export function decisionLine(d: DecisionInput): string {
  if (d.layout === "readonly") {
    return "A read-only summary. Nothing here needs you to act.";
  }
  if (d.layout === "finance" && d.financeQueue) {
    const u = d.financeQueue.uncategorized;
    const p = d.financeQueue.proposals;
    if (u && u > 0) return `Start with the books: ${plural(u, "transaction")} still ${u === 1 ? "needs" : "need"} a category.`;
    if (p && p > 0) return `Start with Reconcile: ${plural(p, "proposed gift")} ${p === 1 ? "is" : "are"} waiting for you.`;
  }
  const parts: string[] = [];
  if (d.mine.late > 0) {
    parts.push(
      `${plural(d.mine.late, "thing")} of yours ${d.mine.late === 1 ? "is" : "are"} late.${d.mine.first ? ` Start with "${d.mine.first}".` : ""}`,
    );
  } else if (d.mine.dueToday > 0) {
    parts.push(`Nothing of yours is late. ${plural(d.mine.dueToday, "thing")} ${d.mine.dueToday === 1 ? "is" : "are"} due today.`);
  } else {
    parts.push("Nothing of yours is late or due today.");
  }
  if (d.captureWaiting && d.captureWaiting > 0) {
    parts.push(`${plural(d.captureWaiting, "recording")} still ${d.captureWaiting === 1 ? "has" : "have"} cards to confirm.`);
  }
  if (d.money && d.money.runwayMonths != null && !d.money.stale) {
    parts.push(
      d.money.runwayMonths >= 6
        ? `Runway is steady at ${d.money.runwayMonths.toFixed(1)} months.`
        : `Runway is ${d.money.runwayMonths.toFixed(1)} months. Worth a look.`,
    );
  } else if (d.money && d.money.stale) {
    parts.push("The cash balance is out of date.");
  }
  return parts.join(" ");
}

/** Monday of the org-local week containing `today` (YYYY-MM-DD). */
export function weekStart(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
