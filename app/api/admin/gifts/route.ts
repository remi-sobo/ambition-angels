import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Epic A — manual / offline gift entry. The Stripe pipeline auto-ingests
// online gifts via the donations trigger; this is the path for checks, cash,
// stock, in-kind, and any gift recorded by hand. Writes straight to the
// `gifts` spine so it lands in rollups, retention math, and the
// acknowledgment queue exactly like an online gift.

const METHODS = ["card", "cash", "check", "ach", "in_kind", "stock", "other"] as const;

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const money = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

/**
 * POST /api/admin/gifts — record a gift.
 *
 * Donor: pass `constituent_id` (from a donor page), or `constituent_name` to
 * find-or-create a person (same UX as opportunities/grants), or
 * `anonymous: true` for a gift with no usable identity (still counts in
 * revenue). Amount + gift_date are required.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const amount = money(body.amount);
  if (amount === null || amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }
  if (!isISODate(body.gift_date)) {
    return NextResponse.json({ error: "gift_date (YYYY-MM-DD) is required" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // Resolve the donor: explicit id, free-text name (find-or-create), or anon.
  let constituentId: string | null = null;
  let warning: string | undefined;
  if (isUuid(body.constituent_id)) {
    constituentId = body.constituent_id;
  } else if (body.anonymous === true) {
    constituentId = null;
  } else {
    const name = typeof body.constituent_name === "string" ? body.constituent_name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "constituent_id, constituent_name, or anonymous is required" },
        { status: 400 }
      );
    }
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
        ]
          .filter(Boolean)
          .join(",")
      )
      .limit(2);
    if (matches && matches.length >= 1) {
      constituentId = matches[0].id;
      if (matches.length > 1) {
        warning = `Multiple constituents match "${name}" — linked the first; verify on the donor page.`;
      }
    } else {
      const { data: created, error: cErr } = await supabase
        .from("constituents")
        .insert({ type: "person", first_name: first || name, last_name: rest || null, source: "manual" })
        .select("id")
        .single();
      if (cErr || !created) {
        console.error("[gifts] create constituent failed:", cErr?.message);
        return NextResponse.json({ error: "Could not create constituent" }, { status: 500 });
      }
      constituentId = created.id;
      warning = `Created a new constituent for "${name}" — add contact details on the donor page.`;
    }
  }

  const insert: Record<string, unknown> = {
    constituent_id: constituentId,
    amount,
    gift_date: body.gift_date,
    method: METHODS.includes(body.method as (typeof METHODS)[number]) ? body.method : "check",
    external_source: "manual",
  };
  if (isUuid(body.fund_id)) insert.fund_id = body.fund_id;
  if (isUuid(body.campaign_id)) insert.campaign_id = body.campaign_id;
  if (isUuid(body.appeal_id)) insert.appeal_id = body.appeal_id;
  const fmv = money(body.fair_market_value);
  if (fmv !== null && fmv > 0) {
    // Quid-pro-quo: the deductible portion is amount − FMV (never below 0).
    insert.fair_market_value = fmv;
    insert.deductible_amount = Math.max(0, Math.round((amount - fmv) * 100) / 100);
  }
  if (typeof body.notes === "string" && body.notes.trim()) insert.notes = body.notes.slice(0, 2000);

  const { data: gift, error } = await supabase.from("gifts").insert(insert).select("id").single();
  if (error || !gift) {
    console.error("[gifts] create failed:", error?.message);
    return NextResponse.json({ error: "Could not record gift" }, { status: 500 });
  }

  await audit(req, {
    action: "fundraising.gift.create",
    entityType: "gifts",
    entityId: gift.id,
    after: insert,
  });

  return NextResponse.json({ id: gift.id, constituent_id: constituentId, warning });
}
