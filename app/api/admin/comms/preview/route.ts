import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/requirePermission";
import { resolveRecipients, recipientMergeData, previewPool, type Recipient, type RecipientFilter } from "@/lib/fundraising/segments";
import { campaignHtml } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker } from "@/lib/comms/settings";
import { getGmailConnectionStatus } from "@/lib/comms/gmail-connection";
import { checkMerge, mergeText, EMPTY_MERGE } from "@/lib/comms/merge";
import { MAX_RECIPIENTS, spreadMessage } from "@/lib/comms/queue-plan";

/**
 * The composer's live preview and pre-send check (specs/comms-v3-composer.md).
 * Given the subject and body as typed and a list, it returns the exact email
 * one real person on that list would get, built by the same merge and the
 * same HTML renderer the worker sends with, plus everything that would stop
 * or qualify the send. Read-only: it takes the text from the request so the
 * preview never waits on a save, and it queues nothing.
 */

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

type Only = RecipientFilter;

export async function POST(req: NextRequest) {
  const gate = await requirePermission("fundraising.read", { entitlement: "modules.comms" });
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const orgId = gate.ctx.orgId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 500) : "";
  const text = typeof body.body === "string" ? body.body.slice(0, 20000) : "";
  const only: Only = body.only === "no_first_name" || body.only === "never_gave" ? body.only : "all";

  const supabase = createServerSupabase();
  const [settings, gmail] = await Promise.all([loadOrgCommsSettings(supabase, orgId), getGmailConnectionStatus(orgId)]);

  // Who it goes to.
  let recipients: Recipient[] = [];
  let excluded = { doNotContact: 0, suppressed: 0, noEmail: 0 };
  let listError: string | null = null;
  let listName: string | null = null;
  if (isUuid(body.segment_id)) {
    const { data: seg } = await supabase.from("segments").select("name, definition").eq("org_id", orgId).eq("id", body.segment_id).maybeSingle();
    if (!seg) listError = "That list wasn't found.";
    else {
      listName = seg.name as string;
      const r = await resolveRecipients(supabase, seg.definition, orgId);
      recipients = r.recipients;
      excluded = r.excluded;
      listError = r.error ?? null;
    }
  }
  const pool = previewPool(recipients, only);
  const index = pool.length ? Math.min(Math.max(0, Number(body.index) || 0), pool.length - 1) : 0;
  const person = pool[index] ?? null;

  // The email for that person. With no list yet, the preview shows the
  // fallback words so the writer still sees a real-looking email.
  const data = person ? recipientMergeData(person) : EMPTY_MERGE;
  const mergedSubject = mergeText(subject, data);
  const mergedBody = mergeText(text, data);
  const html = settings ? campaignHtml(mergedBody.text, settings, "#", null) : "";

  // What stops or qualifies the send.
  const merge = checkMerge(subject, text, recipients.map(recipientMergeData));
  const blockers: string[] = [];
  const notes: string[] = [...merge.notes];
  if (!subject.trim()) blockers.push("Add a subject.");
  if (!text.trim()) blockers.push("Write the message.");
  if (!isUuid(body.segment_id)) blockers.push("Choose who it goes to.");
  else if (listError) blockers.push(listError);
  else if (recipients.length === 0) blockers.push("No one on this list can be emailed.");
  else if (recipients.length > MAX_RECIPIENTS) {
    blockers.push(`This list has ${recipients.length.toLocaleString("en-US")} people. One email can go to ${MAX_RECIPIENTS.toLocaleString("en-US")} at most.`);
  }
  blockers.push(...merge.blockers);
  const senderBlock = sendBlocker(settings);
  if (senderBlock) blockers.push(senderBlock);
  else if (settings?.transport === "gmail" && gmail.state !== "active") {
    blockers.push("Gmail is not connected. Connect it on the Emails page before sending.");
  }
  if (settings && recipients.length > 0 && recipients.length <= MAX_RECIPIENTS) {
    const spread = spreadMessage(recipients.length, settings.daily_send_cap, settings.daily_send_cap);
    if (spread) notes.push(spread);
  }
  const leftOut = [
    excluded.noEmail ? `${excluded.noEmail} with no email` : "",
    excluded.suppressed ? `${excluded.suppressed} unsubscribed or bounced` : "",
    excluded.doNotContact ? `${excluded.doNotContact} marked do not contact` : "",
  ].filter(Boolean);
  if (leftOut.length) notes.push(`Left out of this list: ${leftOut.join(", ")}.`);

  const gmailAccount = gmail.state === "none" ? null : gmail.accountEmail;
  const fromEmail = settings?.transport === "gmail" ? gmailAccount : settings?.from_email ?? null;
  return NextResponse.json({
    list: { name: listName, recipients: recipients.length, no_first_name: recipients.filter((r) => !r.firstName.trim()).length, never_gave: recipients.filter((r) => r.giftCount === 0).length },
    pool: pool.length,
    index,
    person: person ? { name: person.name, email: person.email } : null,
    from: settings ? { name: settings.from_name, email: fromEmail } : null,
    subject: mergedSubject.text,
    html,
    blockers,
    notes,
  });
}
