import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { pushGiftToHubSpot } from "@/lib/hubspot/sync-out";
import { processGiftStewardship } from "@/lib/fundraising/stewardship";
import { resolveConstituentStrict } from "@/lib/fundraising/constituent-resolve";

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
  const ctx = await getOrgContext();
  if (!ctx) {
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
  // Matching is pinned to the active org and never guesses between several
  // donors (lib/fundraising/constituent-resolve.ts).
  let constituentId: string | null = null;
  let warning: string | undefined;
  if (body.anonymous === true && !isUuid(body.constituent_id)) {
    constituentId = null;
  } else {
    const resolved = await resolveConstituentStrict(supabase, ctx.orgId, {
      constituentId: body.constituent_id,
      name: body.constituent_name,
    });
    if ("error" in resolved) {
      const { status, ...rest } = resolved;
      return NextResponse.json(
        status === 400 ? { error: "constituent_id, constituent_name, or anonymous is required" } : rest,
        { status }
      );
    }
    constituentId = resolved.constituentId;
    warning = resolved.warning;
  }

  const insert: Record<string, unknown> = {
    // Stamp org_id from session — never ride the AA column default (org_id trap).
    org_id: ctx.orgId,
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

  // Mirror to a connected HubSpot as a closed-won deal (opt-in; no-op otherwise).
  await pushGiftToHubSpot(gift.id);

  // Stewardship matrix: decide whether this gift auto-sends a compliant receipt,
  // spawns a personal-touch ack task, or is marked not-required — all driven by
  // stewardship_rules, never a hardcoded threshold. Best-effort; never blocks
  // the gift. With no rules seeded it falls through to 'none' (not_required).
  const createdBy = await getAdminUser();
  if (createdBy) {
    await processGiftStewardship(supabase, { orgId: ctx.orgId, createdBy, giftId: gift.id });
  }

  return NextResponse.json({ id: gift.id, constituent_id: constituentId, warning });
}
