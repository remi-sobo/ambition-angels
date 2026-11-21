import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { listOrgMembers } from "@/lib/admin/owners-server";
import { isMine, rankMine, weekStart, type Me, type MineItem } from "@/lib/admin/todayPanels";
import { donorsNeedingMe, type DonorAsk, type DonorGift, type DonorNeed, type DonorRow } from "@/lib/admin/todayDonors";
import { constituentName } from "@/lib/fundraising/display";

/**
 * V4 Stage C (spec §7): the loaders behind Today's role panels. Every read is
 * the SESSION client plus an explicit org fence, so RLS applies the caller's
 * own permissions (a role that cannot read a table simply gets an empty
 * panel) and a member of two orgs only ever sees the active one. No
 * service-role client here: nothing on this module needs a page guard beyond
 * the page's own finance.read check for money.
 *
 * Assignment: `owner_id` (add_owner_id_assignment.sql: constituents, asks,
 * cohorts, programs; ops_tasks.assigned_to_id) wins; the older text owner
 * (ops_tasks.assigned_to, opportunities.owner, asks.owner) is the fallback
 * for rows that have no owner_id yet (isMine). The generated types do not
 * carry owner_id on these joined selects, so rows are typed locally here;
 * member names come from Stage B2's lib/admin/owners-server.ts.
 */

type Sb = ReturnType<typeof createServerSupabase>;

const OPEN_STAGES = ["identify", "qualify", "cultivate", "solicit"];
const OPEN_ASKS = ["draft", "submitted", "pending"];

type NameBits = { type?: string | null; first_name: string | null; last_name: string | null; org_name: string | null };
const nameOf = (c: NameBits | null | undefined) =>
  c ? constituentName({ type: c.type ?? "person", first_name: c.first_name, last_name: c.last_name, org_name: c.org_name } as Parameters<typeof constituentName>[0]) : "A donor";

const usd = (n: number | string | null) => (n == null ? null : `$${Math.round(Number(n)).toLocaleString("en-US")}`);

export type MineResult = { items: MineItem[]; failed: string[] };

/** Tasks, next moves, asks and owned obligations that are mine, ranked. */
export async function loadMine(
  supabase: Sb,
  orgId: string,
  me: Me,
  today: string,
  can: { ops: boolean; fundraising: boolean },
): Promise<MineResult> {
  const failed: string[] = [];
  const items: MineItem[] = [];
  const handle = me.handle ?? "__nobody__";

  const [tasks, opps, asks, obligations] = await Promise.all([
    can.ops
      ? supabase
          .from("ops_tasks")
          .select("id, title, due_date, status, assigned_to, assigned_to_id, linked_label, category")
          .eq("org_id", orgId)
          .neq("status", "done")
          .is("archived_at", null)
          .or(`assigned_to_id.eq.${me.userId},and(assigned_to_id.is.null,assigned_to.eq.${handle})`)
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    can.fundraising
      ? supabase
          .from("opportunities")
          .select("id, constituent_id, name, next_step, next_step_due, owner, ask_amount, stage, constituent:constituents(type, first_name, last_name, org_name, owner_id)")
          .eq("org_id", orgId)
          .in("stage", OPEN_STAGES)
          .not("next_step", "is", null)
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    can.fundraising
      ? supabase
          .from("asks")
          .select("id, title, form, amount_requested, ask_date, status, owner, owner_id, funder:constituents(type, first_name, last_name, org_name)")
          .eq("org_id", orgId)
          .in("status", OPEN_ASKS)
          .or(`owner_id.eq.${me.userId},and(owner_id.is.null,owner.ilike.${handle})`)
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("v_obligations")
      .select("id, type, title, due_date, owner_id")
      .eq("org_id", orgId)
      .eq("owner_id", me.userId)
      .in("type", ["grant_requirement", "compliance_item", "capture"])
      .limit(50),
  ]);

  if (tasks.error) failed.push("tasks");
  for (const t of (tasks.data ?? []) as {
    id: string; title: string; due_date: string | null; status: string; assigned_to: string | null; assigned_to_id: string | null; linked_label: string | null; category: string | null;
  }[]) {
    if (!isMine({ owner_id: t.assigned_to_id, owner_text: t.assigned_to }, me)) continue;
    items.push({
      id: `task:${t.id}`, kind: "task", title: t.title,
      kindLabel: t.category === "fundraising" ? "Donor follow-up" : t.status === "blocked" ? "Task, blocked" : "Task",
      context: t.linked_label, due: t.due_date, href: "/admin/work/tasks", action: "Open",
    });
  }

  if (opps.error) failed.push("next moves");
  for (const o of (opps.data ?? []) as unknown as {
    id: string; constituent_id: string; name: string | null; next_step: string | null; next_step_due: string | null; owner: string | null; ask_amount: number | null;
    constituent: (NameBits & { owner_id: string | null }) | null;
  }[]) {
    if (!o.next_step?.trim()) continue;
    // The ask's own text owner first; with none, the donor's owner_id.
    const mine = o.owner?.trim() ? isMine({ owner_text: o.owner }, me) : isMine({ owner_id: o.constituent?.owner_id ?? null }, me);
    if (!mine) continue;
    items.push({
      id: `move:${o.id}`, kind: "next_move", title: `${o.next_step.trim()}, ${nameOf(o.constituent)}`,
      kindLabel: "Next move", context: [o.name, usd(o.ask_amount) ? `${usd(o.ask_amount)} ask` : null].filter(Boolean).join(" · ") || null,
      due: o.next_step_due, href: `/admin/fundraising/donors-funders/${o.constituent_id}`, action: "Open",
    });
  }

  if (asks.error) failed.push("asks");
  for (const a of (asks.data ?? []) as unknown as {
    id: string; title: string | null; form: string; amount_requested: number | null; ask_date: string | null; status: string; owner: string | null; owner_id: string | null; funder: NameBits | null;
  }[]) {
    if (!isMine({ owner_id: a.owner_id, owner_text: a.owner }, me)) continue;
    items.push({
      id: `ask:${a.id}`, kind: "ask", title: a.title?.trim() || `Ask to ${nameOf(a.funder)}`,
      kindLabel: a.status === "draft" ? "Ask, draft" : "Ask, waiting",
      context: [nameOf(a.funder), usd(a.amount_requested)].filter(Boolean).join(" · "),
      // ask_date is when the ask was (or is to be) made, not a deadline, so
      // an open ask never reads as "late"; dated work outranks it.
      due: null, href: `/admin/fundraising/asks/${a.id}`, action: "Open",
    });
  }

  if (obligations.error) failed.push("other items");
  for (const r of (obligations.data ?? []) as { id: string; type: string; title: string; due_date: string | null }[]) {
    const source = r.id.slice(r.id.indexOf(":") + 1);
    items.push({
      id: r.id, kind: "obligation", title: r.title,
      kindLabel: r.type === "capture" ? "Cards to confirm" : r.type === "grant_requirement" ? "Grant report" : "Compliance",
      context: null, due: r.due_date,
      href: r.type === "capture" ? `/admin/capture/${source}` : r.type === "compliance_item" ? "/admin/organization/compliance" : "/admin/fundraising/grants",
      action: r.type === "capture" ? "Review" : "Open",
    });
  }

  return { items: rankMine(items, today), failed };
}

/** Donors assigned to me that need a touch. */
export async function loadDonorsNeedMe(supabase: Sb, orgId: string, me: Me, today: string): Promise<{ items: DonorNeed[]; owned: number; failed: boolean }> {
  const handle = me.handle ?? "__nobody__";
  const [ownedRes, viaAsk] = await Promise.all([
    supabase
      .from("constituents")
      .select("id, type, first_name, last_name, org_name")
      .eq("org_id", orgId)
      .eq("owner_id", me.userId)
      .is("archived_at", null)
      .limit(300),
    supabase
      .from("opportunities")
      .select("constituent_id, owner, constituent:constituents(id, type, first_name, last_name, org_name, owner_id)")
      .eq("org_id", orgId)
      .in("stage", OPEN_STAGES)
      .ilike("owner", handle)
      .limit(300),
  ]);
  if (ownedRes.error) return { items: [], owned: 0, failed: true };
  const donors = new Map<string, DonorRow>();
  for (const c of (ownedRes.data ?? []) as (NameBits & { id: string })[]) donors.set(c.id, { id: c.id, name: nameOf(c) });
  for (const o of (viaAsk.data ?? []) as unknown as { constituent: (NameBits & { id: string; owner_id: string | null }) | null }[]) {
    const c = o.constituent;
    // The text owner is only a fallback for donors with no owner_id.
    if (c && !c.owner_id && !donors.has(c.id)) donors.set(c.id, { id: c.id, name: nameOf(c) });
  }
  const ids = Array.from(donors.keys());
  if (ids.length === 0) return { items: [], owned: 0, failed: false };
  const [giftsRes, asksRes] = await Promise.all([
    supabase.from("gifts").select("constituent_id, gift_date, amount, acknowledgment_status").eq("org_id", orgId).in("constituent_id", ids).limit(3000),
    supabase.from("opportunities").select("constituent_id, next_step, next_step_due, stage").eq("org_id", orgId).in("constituent_id", ids).limit(1000),
  ]);
  const gifts = ((giftsRes.data ?? []) as DonorGift[]).map((g) => ({ ...g, amount: Number(g.amount) }));
  const asks = (asksRes.data ?? []) as DonorAsk[];
  return { items: donorsNeedingMe(Array.from(donors.values()), gifts, asks, today), owned: ids.length, failed: !!(giftsRes.error || asksRes.error) };
}

export type TeamRow = { who: string; what: string; state: string; tone: "warn" | "muted"; href: string };

/** Team this week: who is stuck, who finished what, since Monday. Not my own work. */
export async function loadTeamWeek(supabase: Sb, orgId: string, me: Me, today: string): Promise<{ rows: TeamRow[]; failed: boolean }> {
  const monday = weekStart(today);
  const [doneRes, stuckRes] = await Promise.all([
    supabase
      .from("ops_tasks")
      .select("id, assigned_to_id, assigned_to, completed_at")
      .eq("org_id", orgId)
      .eq("status", "done")
      .gte("completed_at", `${monday}T00:00:00Z`)
      .limit(500),
    supabase
      .from("ops_tasks")
      .select("id, title, assigned_to_id, assigned_to, updated_at")
      .eq("org_id", orgId)
      .eq("status", "blocked")
      .is("archived_at", null)
      .limit(50),
  ]);
  if (doneRes.error && stuckRes.error) return { rows: [], failed: true };
  type T = { id: string; title?: string; assigned_to_id: string | null; assigned_to: string | null; updated_at?: string };
  const done = (doneRes.data ?? []) as T[];
  const stuck = (stuckRes.data ?? []) as T[];
  const notMine = (t: T) => !isMine({ owner_id: t.assigned_to_id, owner_text: t.assigned_to }, me);
  // Member names from B2's owner helpers (the active org's memberships only).
  const names: Record<string, string> = Object.fromEntries((await listOrgMembers(orgId)).map((m) => [m.userId, m.name]));
  const who = (t: T) => {
    const full = (t.assigned_to_id && names[t.assigned_to_id]) || t.assigned_to || "Unassigned";
    return full.split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase());
  };
  const rows: TeamRow[] = [];
  for (const t of stuck.filter(notMine).slice(0, 4)) {
    const days = t.updated_at ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(t.updated_at)) / 86_400_000)) : null;
    rows.push({
      who: who(t), what: `is stuck on "${t.title ?? "a task"}"`,
      state: days ? `Blocked for ${days} day${days === 1 ? "" : "s"}` : "Blocked", tone: "warn", href: "/admin/work/tasks",
    });
  }
  const byWho = new Map<string, number>();
  for (const t of done.filter(notMine)) byWho.set(who(t), (byWho.get(who(t)) ?? 0) + 1);
  for (const [name, n] of Array.from(byWho.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    rows.push({ who: name, what: `finished ${n} task${n === 1 ? "" : "s"}`, state: "Done this week", tone: "muted", href: "/admin/work/tasks" });
  }
  return { rows, failed: !!(doneRes.error || stuckRes.error) };
}

export type FinanceQueue = {
  uncategorized: number | null;
  recent: { id: string; date: string; description: string; amount: number }[];
  proposals: number | null;
};

/** Finance: transactions still waiting for a category, and Reconcile proposals. */
export async function loadFinanceQueue(supabase: Sb, orgId: string): Promise<FinanceQueue> {
  const [countRes, recentRes, propRes] = await Promise.all([
    supabase.from("fin_transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("category_id", null),
    supabase
      .from("fin_transactions")
      .select("id, txn_date, description, amount")
      .eq("org_id", orgId)
      .is("category_id", null)
      .order("txn_date", { ascending: false })
      .limit(4),
    supabase.from("fin_reconciliation_items").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending"),
  ]);
  return {
    uncategorized: countRes.error ? null : countRes.count ?? 0,
    recent: ((recentRes.data ?? []) as { id: string; txn_date: string; description: string | null; amount: number }[]).map((t) => ({
      id: t.id, date: t.txn_date, description: t.description?.trim() || "No description", amount: Number(t.amount),
    })),
    proposals: propRes.error ? null : propRes.count ?? 0,
  };
}

export type CohortRow = { id: string; name: string; status: string; unrecorded: number; next: string | null };

/** Staff: the cohorts assigned to me, with sessions waiting for attendance. Counts only. */
export async function loadMyCohorts(supabase: Sb, orgId: string, me: Me, today: string): Promise<{ rows: CohortRow[]; failed: boolean }> {
  const { data, error } = await supabase
    .from("cohorts")
    .select("id, name, status")
    .eq("org_id", orgId)
    .eq("owner_id", me.userId)
    .in("status", ["planning", "active"])
    .limit(20);
  if (error) return { rows: [], failed: true };
  const cohorts = (data ?? []) as { id: string; name: string; status: string }[];
  if (cohorts.length === 0) return { rows: [], failed: false };
  const { data: sess } = await supabase
    .from("cohort_sessions")
    .select("cohort_id, session_date, status")
    .eq("org_id", orgId)
    .in("cohort_id", cohorts.map((c) => c.id))
    .eq("status", "scheduled")
    .limit(1000);
  const sessions = (sess ?? []) as { cohort_id: string; session_date: string }[];
  return {
    rows: cohorts.map((c) => {
      const mine = sessions.filter((s) => s.cohort_id === c.id);
      return {
        id: c.id, name: c.name, status: c.status,
        unrecorded: mine.filter((s) => s.session_date < today).length,
        next: mine.filter((s) => s.session_date >= today).map((s) => s.session_date).sort()[0] ?? null,
      };
    }),
    failed: false,
  };
}

/** Board viewer: the next and last board meetings (board.read RLS). */
export async function loadBoardSummary(supabase: Sb, orgId: string, today: string) {
  const [next, last] = await Promise.all([
    supabase.from("board_meetings").select("id, meeting_date, title").eq("org_id", orgId).gte("meeting_date", today).order("meeting_date", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("board_meetings").select("id, meeting_date, title, minutes_status").eq("org_id", orgId).lt("meeting_date", today).order("meeting_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    next: (next.data as { id: string; meeting_date: string; title: string } | null) ?? null,
    last: (last.data as { id: string; meeting_date: string; title: string; minutes_status: string } | null) ?? null,
  };
}
