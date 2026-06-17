import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAuthed } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { personalize, campaignHtml, campaignText } from "@/lib/fundraising/comms-email";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// Send a single preview of a campaign to a chosen address. No email_sends row;
// subject is prefixed [TEST]. Lets staff proof a draft before the real send.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const to = typeof body?.email === "string" ? body.email.trim() : "";
  if (!to) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email is not configured" }, { status: 500 });

  const supabase = createServerSupabase();
  const { data: c } = await supabase.from("email_campaigns").select("subject, body").eq("id", params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const text = personalize(c.body as string, "there");
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "Ambition Angels <careers@mail.ambitionangels.org>",
      to,
      subject: `[TEST] ${c.subject as string}`,
      html: campaignHtml(text, null),
      text: campaignText(text, null),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  await audit(req, { action: "fundraising.campaign_email.test", entityType: "email_campaigns", entityId: params.id, after: { to } });
  return NextResponse.json({ ok: true });
}
