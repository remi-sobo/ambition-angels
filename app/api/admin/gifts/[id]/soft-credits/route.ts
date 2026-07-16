import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic D2 — soft credits: recognition for someone other than the hard-credit
// donor on a gift (a solicitor, a DAF/match originator, a household member).
// Soft credits never count in revenue rollups, only in recognition.

const TYPES = ["household", "daf_advisor", "match_originator", "solicitor"] as const;
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const money = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

/**
 * POST /api/admin/gifts/[id]/soft-credits — credit a constituent on a gift.
 * Donor by `constituent_id` or free-text `constituent_name` (find-or-create
 * person). Amount defaults to the gift's full amount.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad gift id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!TYPES.includes(body.type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "type must be household/daf_advisor/match_originator/solicitor" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data: gift, error: gErr } = await supabase
    .from("gifts")
    .select("id, amount")
    .eq("id", params.id)
    .maybeSingle();
  if (gErr || !gift) return NextResponse.json({ error: "Gift not found" }, { status: 404 });

  // Resolve the credited constituent.
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
      if (matches.length > 1) warning = `Multiple constituents match "${name}" — credited the first.`;
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

  const amount = money(body.amount) ?? Number(gift.amount);
  const insert = { org_id: ctx.orgId, gift_id: gift.id, constituent_id: constituentId, type: body.type, amount };
  const { data, error } = await supabase.from("soft_credits").insert(insert).select("id").single();
  if (error || !data) {
    console.error("[soft_credits] create failed:", error?.message);
    return NextResponse.json({ error: "Could not add soft credit" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.soft_credit.create",
    entityType: "soft_credits",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ id: data.id, warning });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad gift id" }, { status: 400 });
  const scId = new URL(req.url).searchParams.get("soft_credit_id");
  if (!isUuid(scId)) return NextResponse.json({ error: "soft_credit_id is required" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase.from("soft_credits").delete().eq("id", scId).eq("gift_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.soft_credit.delete",
    entityType: "soft_credits",
    entityId: scId,
  });
  return NextResponse.json({ ok: true });
}
