import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic G — manually record a recurring plan for an offline monthly donor
// (Stripe plans are created by the donation pipeline; this covers checks/ACH
// standing orders kept by hand).

const FREQS = ["weekly", "monthly", "quarterly", "annually"] as const;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const amount = typeof body.amount === "number" ? Math.round(body.amount * 100) / 100 : NaN;
  if (!(amount > 0)) return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  const frequency = (FREQS.includes(body.frequency as (typeof FREQS)[number]) ? body.frequency : "monthly") as string;

  const supabase = createServerSupabase();
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
