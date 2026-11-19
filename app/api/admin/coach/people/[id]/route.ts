import { NextRequest, NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PERSON_STATUSES } from "@/lib/coach/program";
import { newToken, sendPrivateLink, type CoachPerson } from "@/lib/coach/server";

// Staff actions on one Ambition Coach person (BloomOS → Programs → Coach).
// Fenced to aa.coach and scoped to the session org on every statement.
//   update      status / staff_note
//   send_link   email them their private page link
//   reset_link  rotate the token (old link dies) and email the new one
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ent = await requireEntitlement("aa.coach");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
  const orgId = ent.ctx.orgId;
  const db = getSupabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const { data: person } = await db
    .from("coach_people")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", params.id)
    .maybeSingle();
  if (!person) return NextResponse.json({ error: "Person not found." }, { status: 404 });

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!(PERSON_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: "Unknown status." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (typeof body.staff_note === "string") patch.staff_note = body.staff_note.trim().slice(0, 2000) || null;
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    const { error } = await db.from("coach_people").update(patch).eq("org_id", orgId).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send_link" || body.action === "reset_link") {
    let p = person as CoachPerson;
    if (body.action === "reset_link") {
      const token = newToken();
      const { error } = await db
        .from("coach_people")
        .update({ access_token: token })
        .eq("org_id", orgId)
        .eq("id", params.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      p = { ...p, access_token: token };
    }
    try {
      await sendPrivateLink(p);
    } catch (err) {
      return NextResponse.json(
        { error: `The link email didn't send: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 502 },
      );
    }
    await db
      .from("coach_people")
      .update({ link_sent_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", params.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
