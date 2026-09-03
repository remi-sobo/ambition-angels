import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOperatorEmail, getOperatorEmails, operatorEmailShell } from "@/lib/email/operator";
import { refreshAllPlanMetrics } from "@/lib/admin/plan/metrics";
import { prewarmNarrative } from "@/lib/admin/briefing/narrate";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";
import {
  buildDeadlineReminder,
  type ReminderCompliance,
  type ReminderMove,
  type ReminderRequirement,
} from "@/lib/email/deadline-reminders";

/**
 * Daily deadline reminders (the "never lives in someone's head" promise):
 *  - grant requirements due in exactly 14, 7, or 1 days  → heads-up
 *  - grant requirements overdue (status still open)      → nudge
 *  - major-gift next steps due today or overdue          → nudge
 *  - compliance items due at the same offsets / overdue  → nudge
 *
 * One email PER ORG, to that org's operators only. The service-role client
 * bypasses RLS, so every read below carries the org explicitly and the
 * recipient roster is resolved for that same org. An unscoped version of this
 * job would have mailed one tenant's grants and pipeline to every tenant's
 * admins (see tests/operator-email-scope.test.ts).
 *
 * Auth via Bearer CRON_SECRET (Vercel sets it on cron invocations).
 * Exact-offset matching means each deadline emails at most three times;
 * overdue sections repeat daily by design — they're the point.
 * Sends nothing for an org with nothing to say.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type OrgResult = { orgId: string; sent: boolean; reason?: string; count?: number; dropped?: number };

async function remindOrg(supabase: ReturnType<typeof getSupabaseAdmin>, orgId: string): Promise<OrgResult> {
  const today = plusDays(0);
  const targets = [plusDays(14), plusDays(7), plusDays(1)];

  const [dueRes, overdueRes, movesRes, compDueRes, compOverdueRes] = await Promise.all([
    supabase
      .from("grant_requirements")
      .select("id, org_id, kind, label, due_date, grant:grants(name)")
      .eq("org_id", orgId)
      .in("status", ["upcoming", "in_progress"])
      .in("due_date", targets)
      .order("due_date"),
    supabase
      .from("grant_requirements")
      .select("id, org_id, kind, label, due_date, grant:grants(name)")
      .eq("org_id", orgId)
      .in("status", ["upcoming", "in_progress"])
      .lt("due_date", today)
      .order("due_date")
      .limit(10),
    supabase
      .from("opportunities")
      .select("id, org_id, name, next_step, next_step_due, ask_amount, constituent:constituents(first_name,last_name,org_name,type)")
      .eq("org_id", orgId)
      .lte("next_step_due", today)
      .not("next_step_due", "is", null)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .order("next_step_due")
      .limit(10),
    supabase
      .from("compliance_items")
      .select("id, org_id, title, jurisdiction, due_date")
      .eq("org_id", orgId)
      .in("status", ["upcoming", "in_progress"])
      .in("due_date", targets)
      .order("due_date"),
    supabase
      .from("compliance_items")
      .select("id, org_id, title, jurisdiction, due_date")
      .eq("org_id", orgId)
      .in("status", ["upcoming", "in_progress"])
      .lt("due_date", today)
      .order("due_date")
      .limit(10),
  ]);

  const reminder = buildDeadlineReminder(orgId, {
    due: (dueRes.data ?? []) as unknown as ReminderRequirement[],
    overdue: (overdueRes.data ?? []) as unknown as ReminderRequirement[],
    moves: (movesRes.data ?? []) as unknown as ReminderMove[],
    compDue: (compDueRes.data ?? []) as ReminderCompliance[],
    compOverdue: (compOverdueRes.data ?? []) as ReminderCompliance[],
  });
  if (!reminder) return { orgId, sent: false, reason: "nothing due" };
  if (reminder.droppedForeignRows > 0) {
    // Should be impossible with the fenced reads above; log loudly if not.
    console.error(`[cron/daily-reminders] dropped ${reminder.droppedForeignRows} foreign-org row(s) for org ${orgId}`);
  }

  const recipients = await getOperatorEmails(orgId);
  if (recipients.length === 0) return { orgId, sent: false, reason: "no operators", count: reminder.count };

  const sent = await sendOperatorEmail(
    orgId,
    reminder.subject,
    operatorEmailShell("Deadlines & next moves", reminder.body)
  );
  return { orgId, sent, count: reminder.count, dropped: reminder.droppedForeignRows };
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  // Refresh the strategy auto-KPIs daily (+ snapshot) so the scorecard's
  // numbers and trend sparklines stay fresh on the home screen. Best-effort —
  // never block the reminders on it. (Per-org inside.)
  await refreshAllPlanMetrics(supabase).catch((e) =>
    console.error("daily plan-metric refresh failed:", e)
  );

  // Pre-warm the Executive Briefing's AI narrative so the first open of the day
  // is instant. Best-effort — never blocks the reminders.
  await prewarmNarrative().catch((e) =>
    console.error("daily briefing narrative pre-warm failed:", e)
  );

  const { data: orgs, error } = await supabase.from("orgs").select("id");
  if (error) {
    return NextResponse.json({ error: `orgs: ${error.message}` }, { status: 500 });
  }

  const results: OrgResult[] = [];
  for (const o of (orgs ?? []) as { id: string }[]) {
    try {
      results.push(await remindOrg(supabase, o.id));
    } catch (e) {
      console.error(`[cron/daily-reminders] org ${o.id} failed:`, e);
      results.push({ orgId: o.id, sent: false, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    orgs: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
}
