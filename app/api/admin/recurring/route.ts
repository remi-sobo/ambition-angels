import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { resolveConstituentStrict } from "@/lib/fundraising/constituent-resolve";

// Epic G — manually record a recurring plan for an offline monthly donor
// (Stripe plans are created by the donation pipeline; this covers checks/ACH
// standing orders kept by hand).

const FREQS = ["weekly", "monthly", "quarterly", "annually"] as const;

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const amount = typeof body.amount === "number" ? Math.round(body.amount * 100) / 100 : NaN;
  if (!(amount > 0)) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  const frequency = (FREQS.includes(body.frequency as (typeof FREQS)[number]) ? body.frequency : "monthly") as string;

  const supabase = createServerSupabase();
  // Resolve the donor inside the active org; several matches are never
  // guessed (lib/fundraising/constituent-resolve.ts).
  const resolved = await resolveConstituentStrict(supabase, ctx.orgId, {
    constituentId: body.constituent_id,
    name: body.constituent_name,
  });
  if ("error" in resolved) {
    const { status, ...rest } = resolved;
    return NextResponse.json(rest, { status });
  }
  const constituentId = resolved.constituentId;
  const warning = resolved.warning;

  const insert = {
    org_id: ctx.orgId,
    constituent_id: constituentId,
    amount,
    frequency,
    status: "active",
    external_source: "manual",
  };
  const { data, error } = await supabase.from("recurring_plans").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[recurring] create failed:", error?.message);
    return NextResponse.json({ error: "Could not create plan" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.recurring.create",
    entityType: "recurring_plans",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id, warning });
}
