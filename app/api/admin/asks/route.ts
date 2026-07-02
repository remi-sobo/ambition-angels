import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed, getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { findOrCreateFunder } from "@/lib/fundraising/grants";
import { isAskForm, isAskStatus } from "@/lib/fundraising/asks";

const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// POST /api/admin/asks — log an ask. Every ask is tied to a funder: pass
// funder_id to link an existing constituent, or funder_name to find-or-create
// an organization funder (mirrors grant creation). org_id is set explicitly
// from the session (asks carries no column default — tenant ratchet).
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getAdminUser();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = createServerSupabase();

  // Funder is required — it's the whole point of the log.
  let funderId: string | null = null;
  if (isUuid(body.funder_id)) {
    funderId = body.funder_id;
  } else if (typeof body.funder_name === "string" && body.funder_name.trim()) {
    const funder = await findOrCreateFunder(supabase, body.funder_name);
    if ("error" in funder) return NextResponse.json({ error: funder.error }, { status: 500 });
    funderId = funder.id;
  }
  if (!funderId) {
    return NextResponse.json({ error: "A funder is required for every ask." }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    org_id: ctx.orgId,
    funder_id: funderId,
    form: isAskForm(body.form) ? body.form : "grant_proposal",
    status: isAskStatus(body.status) ? body.status : "draft",
    created_by: user,
    owner: user,
  };
  if (typeof body.title === "string" && body.title.trim())
    insert.title = body.title.trim().slice(0, 200);
  if (typeof body.amount_requested === "number" && body.amount_requested >= 0)
    insert.amount_requested = Math.round(body.amount_requested * 100) / 100;
  if (typeof body.amount_committed === "number" && body.amount_committed >= 0)
    insert.amount_committed = Math.round(body.amount_committed * 100) / 100;
  if (isISODate(body.ask_date)) insert.ask_date = body.ask_date;
  if (isISODate(body.decided_on)) insert.decided_on = body.decided_on;
  if (isUuid(body.grant_id)) insert.grant_id = body.grant_id;
  if (isUuid(body.opportunity_id)) insert.opportunity_id = body.opportunity_id;
  if (typeof body.owner === "string" && body.owner.trim())
    insert.owner = body.owner.trim().slice(0, 200);
  if (typeof body.notes === "string" && body.notes.trim())
    insert.notes = body.notes.slice(0, 4000);

  const { data, error } = await supabase.from("asks").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(req, {
    action: "fundraising.ask.create",
    entityType: "asks",
    entityId: data.id,
    after: insert,
  });
  return NextResponse.json({ ok: true, ask: data });
}
