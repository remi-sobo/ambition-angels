import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { buildSchedule, type PledgeFrequency } from "@/lib/fundraising/pledges";

// Epic F — create a pledge and generate its installment schedule in one shot.

const FREQS = ["weekly", "monthly", "quarterly", "annually"] as const;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const isISODate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const total = typeof body.total_amount === "number" ? Math.round(body.total_amount * 100) / 100 : NaN;
  if (!(total > 0)) return NextResponse.json({ error: "total_amount must be greater than 0" }, { status: 400 });
  const count = typeof body.installment_count === "number" ? Math.round(body.installment_count) : NaN;
  if (!(count >= 1)) return NextResponse.json({ error: "installment_count must be at least 1" }, { status: 400 });
  const frequency = (FREQS.includes(body.frequency as PledgeFrequency) ? body.frequency : "monthly") as PledgeFrequency;
  if (!isISODate(body.start_date)) return NextResponse.json({ error: "start_date (YYYY-MM-DD) is required" }, { status: 400 });

  const supabase = createServerSupabase();

  // Resolve the donor (id, or find-or-create by name — same UX as gifts/opps).
  let constituentId: string | null = isUuid(body.constituent_id) ? body.constituent_id : null;
  let warning: string | undefined;
  if (!constituentId) {
    const name = typeof body.constituent_name === "string" ? body.constituent_name.trim() : "";
    if (!name) return NextResponse.json({ error: "constituent_id or constituent_name is required" }, { status: 400 });
    const parts = name.split(/\s+/);
    const first = parts[0] ?? "";
    const rest = parts.slice(1).join(" ");
    const { data: matches } = await supabase
      .from("constituents")
      .select("id")
      .or(
        [
          `org_name.ilike.${name}`,
          rest ? `and(first_name.ilike.${first},last_name.ilike.${rest})` : `first_name.ilike.${name}`,
          rest ? "" : `last_name.ilike.${name}`,
        ].filter(Boolean).join(",")
      )
      .limit(2);
    if (matches && matches.length >= 1) {
      constituentId = matches[0].id;
      if (matches.length > 1) warning = `Multiple constituents match "${name}" — linked the first.`;
    } else {
      const { data: created, error: cErr } = await supabase
        .from("constituents")
        .insert({ org_id: ctx.orgId, type: "person", first_name: first || name, last_name: rest || null, source: "manual" })
        .select("id")
        .single();
      if (cErr || !created) return NextResponse.json({ error: "Could not create constituent" }, { status: 500 });
      constituentId = created.id;
      warning = `Created a new constituent for "${name}".`;
    }
  }

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    constituent_id: constituentId,
    total_amount: total,
    installment_count: count,
    frequency,
    start_date: body.start_date,
  };
  if (isUuid(body.campaign_id)) insert.campaign_id = body.campaign_id;
  if (isUuid(body.fund_id)) insert.fund_id = body.fund_id;
  if (typeof body.notes === "string" && body.notes.trim()) insert.notes = body.notes.slice(0, 2000);

  const { data: pledge, error } = await supabase.from("pledges").insert(insert).select("id").single();
  if (error || !pledge) {
    console.error("[pledges] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create pledge" }, { status: 500 });
  }

  // Generate the installment schedule. A failure here shouldn't masquerade as
  // success — the pledge exists but the caller is told the schedule didn't.
  const schedule = buildSchedule({ total, count, frequency, startDate: body.start_date });
  const { error: pErr } = await supabase
    .from("pledge_payments")
    .insert(schedule.map((s) => ({ org_id: ctx.orgId, pledge_id: pledge.id, due_date: s.due_date, expected_amount: s.expected_amount })));
  if (pErr) {
    console.error("[pledges] schedule insert failed:", pErr.message);
    warning = "Pledge created, but the schedule could not be generated — recreate it.";
  }

  await audit(req, {
    action: "fundraising.pledge.create",
    entityType: "pledges",
    entityId: pledge.id,
    after: { ...insert, installments: schedule.length },
  });
  return NextResponse.json({ id: pledge.id, warning });
}
