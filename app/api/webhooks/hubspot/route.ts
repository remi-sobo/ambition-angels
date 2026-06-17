import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hubspotReadEnabled } from "@/lib/hubspot/connection";
import { applyContactFromHubSpot, applyCompanyFromHubSpot } from "@/lib/hubspot/sync-in";

// HubSpot inbound webhooks (X6). Makes the CRM sync two-way: HubSpot pushes
// object changes here, we verify (v3 signature), dedupe (webhook_events), and
// apply contact/company changes to the linked constituents.
//
// Safe by default: requires HUBSPOT_CLIENT_SECRET for verification AND an
// active hubspot connection with `meta.sync_in = true`; otherwise events are
// acknowledged and ignored so HubSpot doesn't retry.
export const dynamic = "force-dynamic";

type HubSpotEvent = {
  eventId?: number | string;
  subscriptionType?: string; // "contact.propertyChange" | "contact.creation" | "company.*" | ...
  objectId?: number | string;
};

// HubSpot v3 signature: base64(HMAC-SHA256(clientSecret, METHOD + URI + body + timestamp)).
function verifyV3(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.HUBSPOT_CLIENT_SECRET;
  const sig = req.headers.get("x-hubspot-signature-v3");
  const ts = req.headers.get("x-hubspot-request-timestamp");
  if (!secret || !sig || !ts) return false;
  // Reject stale requests (replay window: 5 minutes).
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const base = `POST${req.url}${rawBody}${ts}`;
  const expected = crypto.createHmac("sha256", secret).update(base).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyV3(req, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Standalone / outbound-only orgs ack-and-ignore (no retries from HubSpot).
  if (!(await hubspotReadEnabled())) {
    return NextResponse.json({ received: true, ignored: true });
  }

  let events: HubSpotEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  for (const ev of events) {
    const eventId = ev.eventId != null ? String(ev.eventId) : null;
    const type = ev.subscriptionType ?? "";
    const objectId = ev.objectId != null ? String(ev.objectId) : null;
    if (!eventId || !objectId || !type) continue;

    // Dedupe: insert ignoring duplicates; only process if this row is new.
    const { data: inserted } = await admin
      .from("webhook_events")
      .upsert(
        { provider: "hubspot", external_event_id: eventId, topic: type, raw_payload: ev },
        { onConflict: "provider,external_event_id", ignoreDuplicates: true }
      )
      .select("id");
    if (!inserted || inserted.length === 0) continue; // already handled

    let status = "processed";
    try {
      if (type.startsWith("contact.") && !type.endsWith("deletion")) {
        await applyContactFromHubSpot(objectId);
      } else if (type.startsWith("company.") && !type.endsWith("deletion")) {
        await applyCompanyFromHubSpot(objectId);
      }
      // deletions and deal/engagement events are intentionally not applied here
      // (BloomOS is the system of record for those) — logged + acknowledged.
    } catch (e) {
      status = "failed";
      console.error(`[hubspot inbound] ${type} ${objectId} failed:`, (e as Error).message);
    }
    await admin
      .from("webhook_events")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("provider", "hubspot")
      .eq("external_event_id", eventId);
  }

  return NextResponse.json({ received: true });
}
