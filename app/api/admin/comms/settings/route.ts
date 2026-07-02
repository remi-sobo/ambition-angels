import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Org sending identity (org_comms_settings). Reads need fundraising.read;
// writes are gated by the org.manage RLS policy — a non-manager's PATCH
// updates zero rows and returns 403.

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServerSupabase()
    .from("org_comms_settings")
    .select("org_id, from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data ?? null });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.from_name === "string") update.from_name = body.from_name.trim().slice(0, 120);
  if (typeof body.from_email === "string") {
    const v = body.from_email.trim();
    if (v && !isEmail(v)) return NextResponse.json({ error: "from_email is not a valid address" }, { status: 400 });
    update.from_email = v;
  }
  if (typeof body.reply_to === "string" || body.reply_to === null) {
    const v = typeof body.reply_to === "string" ? body.reply_to.trim() : "";
    if (v && !isEmail(v)) return NextResponse.json({ error: "reply_to is not a valid address" }, { status: 400 });
    update.reply_to = v || null;
  }
  if (typeof body.mailing_address === "string") update.mailing_address = body.mailing_address.trim().slice(0, 300);
  if (typeof body.footer_text === "string" || body.footer_text === null) {
    const v = typeof body.footer_text === "string" ? body.footer_text.trim().slice(0, 300) : "";
    update.footer_text = v || null;
  }
  if (body.daily_send_cap !== undefined) {
    const n = Number(body.daily_send_cap);
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      return NextResponse.json({ error: "daily_send_cap must be an integer between 1 and 100000" }, { status: 400 });
    }
    update.daily_send_cap = n;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { data, error } = await createServerSupabase()
    .from("org_comms_settings")
    .update(update)
    .eq("org_id", ctx.orgId)
    .select("org_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RLS silently filters rows a non-manager can't write; zero rows = denied
  // (the row itself is seeded by migration, so absence isn't the likely cause).
  if (!data) return NextResponse.json({ error: "Not permitted (org.manage required), or settings row missing" }, { status: 403 });

  await audit(req, { action: "fundraising.comms_settings.update", entityType: "org_comms_settings", entityId: ctx.orgId, after: update });
  return NextResponse.json({ ok: true });
}
