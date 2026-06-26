import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOperatorEmailTo, getOperatorEmails, operatorEmailShell, fmtUsd } from "@/lib/email/operator";
import { snapshotKpis } from "@/lib/kpis";
import { refreshAllPlanMetrics } from "@/lib/admin/plan/metrics";
import { EXCLUDE_PARTNERSHIP_OPPS } from "@/lib/hubspot/stage-map";
import { generateBriefing } from "@/lib/briefing";
import {
  gatherCrmOverdue, groupOverdue, assigneeFromEmail, crmTaskHref, type CrmOverdue,
} from "@/lib/admin/crmOverdue";

/**
 * The Monday digest — Executive Briefing v0 (data-grounded, no model):
 * last week's giving, new constituents, pipeline movement, what's due in
 * the next 14 days, and the open to-dos (pending acknowledgments, overdue
 * moves). The AI-narrated briefing lands in Ring 4 on top of this exact
 * data path.
 *
 * Auth via Bearer CRON_SECRET. Always sends — Monday silence reads as
 * breakage, so a quiet week says so explicitly.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  const weekAgo = daysAgo(7);
  const today = daysAgo(0);
  const horizon = daysAhead(14);
  const weekAgoTs = `${weekAgo}T00:00:00Z`;

  const [giftsRes, newConstituentsRes, stageMovesRes, pendingAcksRes, dueRes, overdueMovesRes] =
    await Promise.all([
      supabase.from("gifts").select("amount").gte("gift_date", weekAgo).limit(5000),
      supabase
        .from("constituents")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgoTs),
      supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "fundraising.opportunity.stage")
        .gte("ts", weekAgoTs),
      supabase
        .from("gifts")
        .select("id", { count: "exact", head: true })
        .eq("acknowledgment_status", "pending"),
      supabase
        .from("grant_requirements")
        .select("kind, label, due_date, grant:grants(name)")
        .in("status", ["upcoming", "in_progress"])
        .gte("due_date", today)
        .lte("due_date", horizon)
        .order("due_date")
        .limit(10),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .lt("next_step_due", today)
        .not("next_step_due", "is", null)
        .not("stage", "in", "(steward,lost)")
        .or(EXCLUDE_PARTNERSHIP_OPPS),
    ]);

  const crmOverdue = await gatherCrmOverdue(today);

  const gifts = (giftsRes.data ?? []) as Array<{ amount: number }>;
  const giftTotal = gifts.reduce((s, g) => s + Number(g.amount), 0);
  type Req = {
    kind: string; label: string | null; due_date: string;
    grant: { name: string } | { name: string }[] | null;
  };
  const due = (dueRes.data ?? []) as unknown as Req[];
  const grantName = (g: Req["grant"]) =>
    (Array.isArray(g) ? g[0]?.name : g?.name) ?? "Unknown grant";

  const stat = (label: string, value: string) =>
    `<td style="padding:8px 12px;border:1px solid #F0EEE8;border-radius:8px;">
       <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6B6960;">${label}</div>
       <div style="font-size:18px;font-weight:700;">${value}</div></td>`;

  let body = `<table style="border-collapse:separate;border-spacing:6px;width:100%;"><tr>
    ${stat("Gifts last week", `${gifts.length} · ${fmtUsd(giftTotal)}`)}
    ${stat("New constituents", String(newConstituentsRes.count ?? 0))}
    ${stat("Pipeline moves", String(stageMovesRes.count ?? 0))}
  </tr></table>`;

  const todos: string[] = [];
  if ((pendingAcksRes.count ?? 0) > 0)
    todos.push(`<strong>${pendingAcksRes.count}</strong> gift${pendingAcksRes.count === 1 ? "" : "s"} awaiting acknowledgment`);
  if ((overdueMovesRes.count ?? 0) > 0)
    todos.push(`<strong>${overdueMovesRes.count}</strong> major-gift move${overdueMovesRes.count === 1 ? "" : "s"} overdue`);
  if (todos.length > 0) {
    body += `<p style="font-weight:600;margin-top:16px;">Needs you</p><ul><li>${todos.join("</li><li>")}</li></ul>`;
  }

  if (due.length > 0) {
    body += `<p style="font-weight:600;margin-top:16px;">Due in the next two weeks</p><ul>${due
      .map((r) => `<li><strong>${grantName(r.grant)}</strong> — ${r.label ?? r.kind.replace(/_/g, " ")} · ${r.due_date}</li>`)
      .join("")}</ul>`;
  }

  if (gifts.length === 0 && todos.length === 0 && due.length === 0 && crmOverdue.total === 0) {
    body += `<p>A quiet week — no new gifts, nothing overdue, nothing due in the next two weeks.</p>`;
  }

  // Weekly KPI snapshot — powers the scorecard's 4-week trends.
  await snapshotKpis(supabase);

  // Refresh the strategy auto-KPIs (Phase 3) so the plan reads live numbers
  // without anyone typing them. Best-effort — never block the digest on it.
  await refreshAllPlanMetrics(supabase).catch((e) =>
    console.error("refreshAllPlanMetrics failed:", e)
  );

  // AI narration (Ring 4): generate + store the Monday edition; prepend the
  // narrative when the model is available, degrade silently when not.
  const briefing = await generateBriefing(supabase, "weekly");
  if (briefing.narrative) {
    body =
      `<p style="font-size:15px;line-height:1.65;">${briefing.narrative}</p>` +
      (briefing.priorities.length > 0
        ? `<p style="font-weight:600;margin-top:12px;">Recommended priorities</p><ol>${briefing.priorities
            .map((p) => `<li>${p}</li>`)
            .join("")}</ol>`
        : "") +
      `<hr style="border:none;border-top:1px solid #F0EEE8;margin:16px 0;">` +
      body;
  }

  // ── Personalised "overdue across CRM" section, scoped per operator ───────
  const taskLi = (t: CrmOverdue["all"][number]) =>
    `<li><a href="${crmTaskHref(t, true)}" style="color:#E8500A;text-decoration:none;font-weight:600;">${t.label}</a>` +
    ` — ${t.title} · <span style="color:#B83D06;">${t.daysOverdue}d overdue</span></li>`;
  const subGroup = (heading: string, rows: CrmOverdue["all"]) =>
    rows.length === 0
      ? ""
      : `<p style="font-weight:600;margin:12px 0 4px;">${heading} (${rows.length})</p><ul style="margin-top:0;">${rows
          .slice(0, 10)
          .map(taskLi)
          .join("")}${rows.length > 10 ? `<li style="color:#6B6960;">+${rows.length - 10} more</li>` : ""}</ul>`;
  const section = (heading: string, g: CrmOverdue) =>
    g.total === 0
      ? ""
      : `<hr style="border:none;border-top:1px solid #F0EEE8;margin:16px 0;">` +
        `<p style="font-weight:700;margin:0 0 4px;">${heading}</p>` +
        subGroup("Partners", g.partners) +
        subGroup("Donors", g.donors);

  const subject = `🌱 Your week: ${gifts.length} gift${gifts.length === 1 ? "" : "s"}${giftTotal > 0 ? ` (${fmtUsd(giftTotal)})` : ""}, ${due.length} deadline${due.length === 1 ? "" : "s"} ahead`;
  const headline = briefing.headline ?? "Good morning, Ambition Angels";

  // One personalised email per operator: their overdue CRM tasks (+ the
  // unassigned ones, so nothing falls through). Unmatched recipients get the
  // org-wide list.
  const operators = await getOperatorEmails();
  let sent = 0;
  for (const email of operators) {
    const who = assigneeFromEmail(email);
    const personal = who
      ? section("⏰ Your overdue CRM tasks", groupOverdue(crmOverdue.all.filter((t) => t.assignedTo === who))) +
        section("Unassigned overdue", groupOverdue(crmOverdue.all.filter((t) => t.assignedTo === null)))
      : section("⏰ Overdue across CRM", crmOverdue);
    const ok = await sendOperatorEmailTo(email, subject, operatorEmailShell(headline, body + personal));
    if (ok) sent += 1;
  }
  return NextResponse.json({ sent, recipients: operators.length });
}
