import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { constituentName } from "@/lib/fundraising/display";
import { addDays, todayInTZ } from "@/lib/admin/ops/week";
import { ACK_LABEL } from "@/lib/fundraising/ack-tasks";
import { getDefaultSteward } from "@/lib/fundraising/steward";
import { IRS_SUBSTANTIATION_THRESHOLD } from "@/lib/fundraising/receipt";

// Milestone detector. Runs daily (vercel.json) and turns date-based stewardship
// moments into ops tasks: a giving anniversary (1 to 5 years after a donor's
// first gift, on the day) and a second gift (a donor's count just reached two).
// First gifts are handled live by the matrix, so they're not detected here.
//
// Each task is an acknowledgment task (sys:ack, so it flows to the queues) plus
// a unique sys:milestone:<key> label that makes the detector idempotent — once
// a milestone task exists, re-running never duplicates it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;
type Donor = { type: string; first_name: string | null; last_name: string | null; org_name: string | null };

async function ensureMilestoneTask(
  admin: Admin,
  opts: { orgId: string; constituentId: string; key: string; title: string; dueDate: string }
): Promise<boolean> {
  const milestoneLabel = `sys:milestone:${opts.key}`;
  // Idempotent across ALL statuses (a completed anniversary task must not be
  // recreated next year's run for the same key).
  const { data: existing } = await admin
    .from("ops_tasks")
    .select("id")
    .eq("org_id", opts.orgId)
    .contains("labels", [milestoneLabel])
    .is("archived_at", null)
    .limit(1);
  if (existing && existing.length > 0) return false;

  const { error } = await admin.from("ops_tasks").insert({
    org_id: opts.orgId,
    title: opts.title,
    category: "fundraising",
    priority: "medium",
    labels: [ACK_LABEL, milestoneLabel],
    assigned_to: await getDefaultSteward(admin, opts.orgId),
    created_by: "system",
    due_date: opts.dueDate,
    linked_entity_type: "constituent",
    linked_entity_id: opts.constituentId,
    linked_label: opts.title,
  });
  if (error) {
    console.error("[cron/milestones] insert failed:", error.message);
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const today = todayInTZ();
  const dueDate = addDays(today, 2);
  let created = 0;

  // ── Giving anniversaries: same month/day, 1..5 years back ──
  const [y, m, d] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const anniversaryDates = new Map<string, number>(); // date -> years
  for (let n = 1; n <= 5; n++) anniversaryDates.set(`${y - n}-${pad(m)}-${pad(d)}`, n);

  const { data: giftsOnDates } = await admin
    .from("gifts")
    .select("org_id, constituent_id, gift_date")
    .in("gift_date", Array.from(anniversaryDates.keys()))
    .not("constituent_id", "is", null)
    .limit(2000);

  for (const g of (giftsOnDates ?? []) as Array<{ org_id: string; constituent_id: string; gift_date: string }>) {
    // Only the FIRST gift earns the anniversary (a gift on this day in a later
    // year is not the donor's giving anniversary).
    const { data: earlier } = await admin
      .from("gifts")
      .select("id")
      .eq("org_id", g.org_id)
      .eq("constituent_id", g.constituent_id)
      .lt("gift_date", g.gift_date)
      .limit(1);
    if (earlier && earlier.length > 0) continue;

    const years = anniversaryDates.get(g.gift_date) ?? 1;
    const { data: con } = await admin
      .from("constituents")
      .select("type, first_name, last_name, org_name")
      .eq("org_id", g.org_id)
      .eq("id", g.constituent_id)
      .maybeSingle();
    const name = con ? constituentName(con as Donor) : "this donor";
    const ok = await ensureMilestoneTask(admin, {
      orgId: g.org_id,
      constituentId: g.constituent_id,
      key: `anniversary-${years}yr-${y}`,
      title: `Thank ${name} on their ${years}-year giving anniversary`,
      dueDate,
    });
    if (ok) created++;
  }

  // ── Second gift: a donor's gift count just reached two ──
  const twoDaysAgo = addDays(today, -2);
  const { data: recent } = await admin
    .from("gifts")
    .select("constituent_id")
    .gte("gift_date", twoDaysAgo)
    .not("constituent_id", "is", null)
    .limit(5000);
  const recentIds = Array.from(new Set((recent ?? []).map((g) => g.constituent_id as string)));

  for (const id of recentIds) {
    const { count } = await admin.from("gifts").select("id", { count: "exact", head: true }).eq("constituent_id", id);
    if ((count ?? 0) !== 2) continue;
    const { data: con } = await admin
      .from("constituents")
      .select("org_id, type, first_name, last_name, org_name")
      .eq("id", id)
      .maybeSingle();
    if (!con) continue;
    const name = constituentName(con as Donor);
    const ok = await ensureMilestoneTask(admin, {
      orgId: con.org_id as string,
      constituentId: id,
      key: `second_gift-${id}`,
      title: `Thank ${name} for their second gift`,
      dueDate,
    });
    if (ok) created++;
  }

  // ── Impact follow-up: 15 to 30 days after a meaningful gift was thanked,
  // create a task to share where the money went. Idempotent per gift. ──
  const upper = new Date(Date.now() - 15 * 86_400_000).toISOString();
  const lower = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: thankedGifts } = await admin
    .from("gifts")
    .select("id, org_id, amount, constituent_id, constituent:constituents(type, first_name, last_name, org_name)")
    .eq("acknowledgment_status", "sent")
    .gte("acknowledged_at", lower)
    .lte("acknowledged_at", upper)
    .gte("amount", IRS_SUBSTANTIATION_THRESHOLD)
    .not("constituent_id", "is", null)
    .limit(2000);

  for (const g of (thankedGifts ?? []) as unknown as Array<{
    id: string;
    org_id: string;
    constituent_id: string;
    constituent: Donor | null;
  }>) {
    const name = g.constituent ? constituentName(g.constituent) : "this donor";
    const ok = await ensureMilestoneTask(admin, {
      orgId: g.org_id,
      constituentId: g.constituent_id,
      key: `impact-${g.id}`,
      title: `Share an impact update with ${name}`,
      dueDate,
    });
    if (ok) created++;
  }

  return NextResponse.json({ ok: true, created });
}
