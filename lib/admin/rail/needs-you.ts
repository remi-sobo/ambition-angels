import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";

/**
 * Needs-you shelf data for the BloomOS right rail.
 *
 * Reads through the SESSION client so RLS scopes every row to the viewer's org
 * and permissions (ops.read / fundraising.read) — no service-role here. Tasks
 * are scoped to the viewer (assigned_to) so the shelf is personal; the next
 * fundraising touch is the org's most-overdue open move (single-lane for now —
 * owner-level scoping lands with the two-lane delegation work).
 *
 * "Next touch" reads `opportunities.next_step` / `next_step_due`, which is where
 * the live "Today's Moves" already lives — not `fr_touches` (that table logs
 * past outreach and is currently empty).
 */

const ORG_TZ = "America/Los_Angeles";

export type NeedsYouTask = {
  id: string;
  title: string;
  due: string | null;
  bucket: "overdue" | "today";
  /** Short weight chip, e.g. "2d" overdue or "today". */
  weight: string;
  href: string;
};

export type NeedsYouTouch = {
  id: string;
  name: string;
  action: string;
  due: string | null;
  weight: string;
  href: string;
};

export type NeedsYouData = {
  overdue: NeedsYouTask[];
  today: NeedsYouTask[];
  nextTouch: NeedsYouTouch | null;
};

/** Today's date as YYYY-MM-DD in the org timezone (ops_tasks store date-only). */
function todayInTZ(tz = ORG_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "today" when due now/future, else how many days overdue ("2d"). */
function dueWeight(due: string | null, today: string): string {
  if (!due) return "";
  const days = Math.round(
    (Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000
  );
  return days <= 0 ? "today" : `${days}d`;
}

type ConstituentLite = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
} | null;

export async function getNeedsYou(): Promise<NeedsYouData> {
  const me = await getAdminUser();
  const sb = createServerSupabase();
  const today = todayInTZ();

  const [taskRes, touchRes] = await Promise.all([
    // Overdue + due-today tasks assigned to the viewer, soonest-overdue first.
    sb
      .from("ops_tasks")
      .select("id, title, due_date")
      .eq("assigned_to", me ?? "")
      .neq("status", "done")
      .is("archived_at", null)
      .not("due_date", "is", null)
      .lte("due_date", today)
      .order("due_date", { ascending: true })
      .limit(8),
    // The single most-overdue open move that still has a next step queued.
    sb
      .from("opportunities")
      .select(
        "id, next_step, next_step_due, constituent:constituents ( id, type, first_name, last_name, org_name )"
      )
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .not("next_step", "is", null)
      .not("next_step_due", "is", null)
      .lte("next_step_due", today)
      .order("next_step_due", { ascending: true })
      .limit(1),
  ]);

  const overdue: NeedsYouTask[] = [];
  const todayTasks: NeedsYouTask[] = [];
  for (const t of taskRes.data ?? []) {
    const due = (t.due_date as string | null) ?? null;
    const row: NeedsYouTask = {
      id: t.id as string,
      title: t.title as string,
      due,
      bucket: due && due < today ? "overdue" : "today",
      weight: dueWeight(due, today),
      href: "/admin/ops",
    };
    (row.bucket === "overdue" ? overdue : todayTasks).push(row);
  }

  let nextTouch: NeedsYouTouch | null = null;
  // Supabase types the embedded relation as an array; it's to-one here, so cast
  // through unknown (matching lib/admin/briefing/fundraising.ts).
  const o = (touchRes.data ?? [])[0] as unknown as
    | { id: string; next_step: string | null; next_step_due: string | null; constituent: ConstituentLite }
    | undefined;
  if (o) {
    nextTouch = {
      id: o.id,
      name: o.constituent ? constituentName(o.constituent) : "a prospect",
      action: o.next_step ?? "Follow up",
      due: o.next_step_due ?? null,
      weight: dueWeight(o.next_step_due ?? null, today),
      href: "/admin/fundraising/today",
    };
  }

  return { overdue, today: todayTasks, nextTouch };
}
