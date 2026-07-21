import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { constituentName } from "@/lib/fundraising/display";
import { addDays, todayInTZ } from "@/lib/admin/ops/week";
import { ACK_LABEL, buildAckTaskInsert, openAckTaskId } from "@/lib/fundraising/ack-tasks";
import { getDefaultSteward } from "@/lib/fundraising/steward";

// POST /api/admin/acknowledgments/thankathon — batch mode. Create ONE parent
// task that fans out into a per-donor call task for every pending thank-you,
// all sharing a script. Existing ack tasks for those gifts are re-parented into
// the batch (so a gift never gets two tasks); gifts without one get a new child.
const DEFAULT_SCRIPT =
  "Call to say thank you. Lead with gratitude, name a specific program their gift supports, ask one question about what drew them to give, and close warmly. Log the call when you're done.";

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const createdBy = await getAdminUser();
  if (!createdBy) return NextResponse.json({ error: "Unknown admin user" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { script?: string } | null;
  const script = typeof body?.script === "string" && body.script.trim() ? body.script.trim() : DEFAULT_SCRIPT;

  const supabase = createServerSupabase();
  const { data: giftsData } = await supabase
    .from("gifts")
    .select("id, amount, gift_date, constituent_id, constituent:constituents(type, first_name, last_name, org_name)")
    .eq("acknowledgment_status", "pending")
    .not("constituent_id", "is", null)
    .order("gift_date", { ascending: true })
    .limit(200);
  const gifts = (giftsData ?? []) as unknown as Array<{
    id: string;
    amount: number;
    gift_date: string;
    constituent_id: string;
    constituent: { type: string; first_name: string | null; last_name: string | null; org_name: string | null } | null;
  }>;
  if (gifts.length === 0) {
    return NextResponse.json({ error: "No pending thank-yous to batch right now." }, { status: 400 });
  }

  const dueDate = addDays(todayInTZ(), 2);
  const steward = await getDefaultSteward(supabase, ctx.orgId);
  const { data: parent, error: parentErr } = await supabase
    .from("ops_tasks")
    .insert({
      org_id: ctx.orgId,
      title: `Thankathon: thank ${gifts.length} ${gifts.length === 1 ? "donor" : "donors"}`,
      description: script,
      category: "fundraising",
      priority: "high",
      labels: [ACK_LABEL, "sys:thankathon"],
      assigned_to: steward,
      created_by: createdBy,
      due_date: dueDate,
    })
    .select("id")
    .single();
  if (parentErr || !parent) {
    console.error("[thankathon] parent insert failed:", parentErr?.message);
    return NextResponse.json({ error: "Could not start the thankathon" }, { status: 500 });
  }

  let reparented = 0;
  let createdChildren = 0;
  for (const g of gifts) {
    const existing = await openAckTaskId(supabase, g.id);
    if (existing) {
      await supabase
        .from("ops_tasks")
        .update({ parent_id: parent.id, description: script })
        .eq("id", existing);
      reparented++;
    } else {
      const insert = buildAckTaskInsert({
        orgId: ctx.orgId,
        createdBy,
        giftId: g.id,
        constituentId: g.constituent_id,
        donorName: g.constituent ? constituentName(g.constituent) : "this donor",
        amount: Number(g.amount),
        giftDate: g.gift_date,
        assignee: steward,
      });
      await supabase.from("ops_tasks").insert({ ...insert, parent_id: parent.id, description: script });
      createdChildren++;
    }
  }

  await audit(req, {
    action: "fundraising.acknowledgment.thankathon",
    entityType: "ops_tasks",
    entityId: parent.id,
    after: { donors: gifts.length, reparented, createdChildren },
  });
  return NextResponse.json({ ok: true, parent_id: parent.id, donors: gifts.length });
}
