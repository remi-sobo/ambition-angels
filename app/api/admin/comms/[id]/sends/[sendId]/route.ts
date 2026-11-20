import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, ctxHasPermission } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// A person deciding about one send (G3):
//   mark_sent    an unclear send that did arrive          (fundraising.write)
//   send_again   an unclear or failed send, queued again   (comms.send)
//   mark_bounced suppress the address as a hard bounce     (fundraising.write)
// The worker never resends an unclear send on its own; this is the only way.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; sendId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id) || !isUuid(params.sendId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  const supabase = createServerSupabase();
  const { data: send } = await supabase
    .from("email_sends")
    .select("id, email, status")
    .eq("org_id", ctx.orgId)
    .eq("campaign_id", params.id)
    .eq("id", params.sendId)
    .maybeSingle();
  if (!send) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "mark_sent") {
    if (send.status !== "unknown") return NextResponse.json({ error: "Only an unclear send can be marked sent." }, { status: 409 });
    const { error } = await supabase
      .from("email_sends")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("org_id", ctx.orgId)
      .eq("id", send.id)
      .eq("status", "unknown");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "send_again") {
    if (!(await ctxHasPermission(ctx, "comms.send"))) {
      return NextResponse.json({ error: "Your role can't send campaigns." }, { status: 403 });
    }
    if (send.status !== "unknown" && send.status !== "failed") {
      return NextResponse.json({ error: "Only an unclear or failed send can go again." }, { status: 409 });
    }
    const { error } = await supabase
      .from("email_sends")
      .update({ status: "pending", claimed_at: null, error: null })
      .eq("org_id", ctx.orgId)
      .eq("id", send.id)
      .in("status", ["unknown", "failed"]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // The worker only claims rows of a sending campaign: reopen a finished one.
    await supabase
      .from("email_campaigns")
      .update({ status: "sending", finished_at: null })
      .eq("org_id", ctx.orgId)
      .eq("id", params.id)
      .eq("status", "sent");
  } else if (action === "mark_bounced") {
    const { error } = await supabase
      .from("email_suppressions")
      .upsert(
        { org_id: ctx.orgId, email: send.email, reason: "hard_bounce", source_campaign_id: params.id },
        { onConflict: "org_id,email", ignoreDuplicates: true }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await audit(req, {
    action: `fundraising.campaign_email.${action}`,
    entityType: "email_campaigns",
    entityId: params.id,
    after: { send_id: send.id },
  });
  return NextResponse.json({ ok: true });
}
