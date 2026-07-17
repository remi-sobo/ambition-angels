import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOperatorEmail, operatorEmailShell, fmtUsd } from "@/lib/email/operator";
import { refreshAllPlanMetrics } from "@/lib/admin/plan/metrics";
import { prewarmNarrative } from "@/lib/admin/briefing/narrate";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { OPEN_STAGE_LIST } from "@/lib/fundraising/stage-sets";

/**
 * Daily deadline reminders (the "never lives in someone's head" promise):
 *  - grant requirements due in exactly 14, 7, or 1 days  → heads-up
 *  - grant requirements overdue (status still open)      → nudge
 *  - major-gift next steps due today or overdue          → nudge
 *
 * Auth via Bearer CRON_SECRET (Vercel sets it on cron invocations).
 * Exact-offset matching means each deadline emails at most three times;
 * overdue sections repeat daily by design — they're the point.
 * Sends nothing when there's nothing to say.
 */
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();

  // Refresh the strategy auto-KPIs daily (+ snapshot) so the scorecard's
  // numbers and trend sparklines stay fresh on the home screen. Best-effort —
  // never block the reminders on it.
  await refreshAllPlanMetrics(supabase).catch((e) =>
    console.error("daily plan-metric refresh failed:", e)
  );

  // Pre-warm the Executive Briefing's AI narrative so the first open of the day
  // is instant (and the morning's read reflects fresh overnight data). The cron
  // fires ~6–7am PT. Best-effort — never blocks the reminders.
  await prewarmNarrative().catch((e) =>
    console.error("daily briefing narrative pre-warm failed:", e)
  );

  const today = plusDays(0);
  const targets = [plusDays(14), plusDays(7), plusDays(1)];

  const [dueRes, overdueRes, movesRes, compDueRes, compOverdueRes] = await Promise.all([
    supabase
      .from("grant_requirements")
      .select("id, kind, label, due_date, grant:grants(name)")
      .in("status", ["upcoming", "in_progress"])
      .in("due_date", targets)
      .order("due_date"),
    supabase
      .from("grant_requirements")
      .select("id, kind, label, due_date, grant:grants(name)")
      .in("status", ["upcoming", "in_progress"])
      .lt("due_date", today)
      .order("due_date")
      .limit(10),
    supabase
      .from("opportunities")
      .select("id, name, next_step, next_step_due, ask_amount, constituent:constituents(first_name,last_name,org_name,type)")
      .lte("next_step_due", today)
      .not("next_step_due", "is", null)
      .in("stage", OPEN_STAGE_LIST)
      .or(EXCLUDE_PARTNERSHIP_OPPS)
      .order("next_step_due")
      .limit(10),
    supabase
      .from("compliance_items")
      .select("id, title, jurisdiction, due_date")
      .in("status", ["upcoming", "in_progress"])
      .in("due_date", targets)
      .order("due_date"),
    supabase
      .from("compliance_items")
      .select("id, title, jurisdiction, due_date")
      .in("status", ["upcoming", "in_progress"])
      .lt("due_date", today)
      .order("due_date")
      .limit(10),
  ]);

  type Req = {
    id: string; kind: string; label: string | null; due_date: string;
    grant: { name: string } | { name: string }[] | null;
  };
  const grantName = (g: Req["grant"]) =>
    (Array.isArray(g) ? g[0]?.name : g?.name) ?? "Unknown grant";

  const due = (dueRes.data ?? []) as unknown as Req[];
  const overdue = (overdueRes.data ?? []) as unknown as Req[];
  type Move = {
    id: string; name: string | null; next_step: string | null; next_step_due: string;
    ask_amount: number | null;
    constituent:
      | { first_name: string | null; last_name: string | null; org_name: string | null; type: string }
      | { first_name: string | null; last_name: string | null; org_name: string | null; type: string }[]
      | null;
  };
  const moves = (movesRes.data ?? []) as unknown as Move[];
  const moveWho = (m: Move) => {
    const c = Array.isArray(m.constituent) ? m.constituent[0] : m.constituent;
    if (!c) return m.name ?? "Unknown";
    return c.type === "organization"
      ? c.org_name ?? "Unknown org"
      : [c.first_name, c.last_name].filter(Boolean).join(" ") || (m.name ?? "Unknown");
  };

  type Comp = { id: string; title: string; jurisdiction: string | null; due_date: string };
  const compDue = (compDueRes.data ?? []) as Comp[];
  const compOverdue = (compOverdueRes.data ?? []) as Comp[];

  if (
    due.length === 0 && overdue.length === 0 && moves.length === 0 &&
    compDue.length === 0 && compOverdue.length === 0
  ) {
    return NextResponse.json({ sent: false, reason: "nothing due" });
  }

  const reqLine = (r: Req) =>
    `<li><strong>${grantName(r.grant)}</strong> — ${r.label ?? r.kind.replace(/_/g, " ")} · due ${r.due_date}</li>`;

  const compLine = (c: Comp) =>
    `<li><strong>${c.title}</strong>${c.jurisdiction && c.jurisdiction !== "—" ? ` (${c.jurisdiction})` : ""} · due ${c.due_date}</li>`;

  let body = "";
  if (compOverdue.length > 0) {
    body += `<p style="color:#DC2626;font-weight:600;">⚠ Overdue compliance filings</p><ul>${compOverdue
      .map(compLine)
      .join("")}</ul>`;
  }
  if (overdue.length > 0) {
    body += `<p style="color:#DC2626;font-weight:600;">⚠ Overdue grant deliverables</p><ul>${overdue
      .map(reqLine)
      .join("")}</ul>`;
  }
  if (due.length > 0 || compDue.length > 0) {
    body += `<p style="font-weight:600;">Coming up</p><ul>${due.map(reqLine).join("")}${compDue
      .map(compLine)
      .join("")}</ul>`;
  }
  if (moves.length > 0) {
    body += `<p style="font-weight:600;">Major-gift moves due</p><ul>${moves
      .map(
        (m) =>
          `<li><strong>${moveWho(m)}</strong>${m.ask_amount ? ` (${fmtUsd(Number(m.ask_amount))})` : ""} — ${m.next_step ?? "next step"} · ${m.next_step_due}</li>`
      )
      .join("")}</ul>`;
  }

  const count =
    due.length + overdue.length + moves.length + compDue.length + compOverdue.length;
  const sent = await sendOperatorEmail(
    `⏰ ${count} deadline${count === 1 ? "" : "s"} need attention`,
    operatorEmailShell("Deadlines & next moves", body)
  );
  return NextResponse.json({
    sent,
    due: due.length,
    overdue: overdue.length,
    moves: moves.length,
    compliance: compDue.length + compOverdue.length,
  });
}
