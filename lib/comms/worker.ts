import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { personalize, buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "./settings";
import { transportFor, TransportError, type Transport } from "./transport";
import { outcomeFor, PACE, WORKER_BUDGET_MS } from "./queue-plan";
import { newTrackingToken } from "./links";
import { raiseAlarms, sendLeadershipCopies } from "./safety";

/**
 * The send worker (specs/comms-v2-gmail-amendment.md G2), run every minute by
 * /api/cron/comms-queue on the service-role client. Ported in shape from the
 * Team Esface engine's drainQueue.
 *
 * Per tick: housekeeping and the orgs with work (comms_queue_tick), then for
 * each org: resolve its transport, claim a batch within its daily cap, check
 * suppression again, send at the transport's pace, write each outcome. Last,
 * refresh campaign counts and close finished campaigns.
 *
 * Every write carries an explicit org_id filter: this is the service role.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

type ClaimedRow = {
  id: string;
  org_id: string;
  campaign_id: string;
  constituent_id: string | null;
  email: string;
  first_name: string | null;
  tracking_token: string | null;
};

type CampaignContent = { subject: string; body: string };

export type DrainResult = {
  orgs: number;
  sent: number;
  failed: number;
  unknown: number;
  suppressed: number;
  requeued: number;
  /** Orgs that couldn't send this tick, with the reason. */
  blocked: Array<{ orgId: string; reason: string }>;
  finished: number;
  alarms: number;
  copies: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function drainQueue(now: () => number = Date.now): Promise<DrainResult> {
  const started = now();
  const admin = getSupabaseAdmin();
  const result: DrainResult = { orgs: 0, sent: 0, failed: 0, unknown: 0, suppressed: 0, requeued: 0, blocked: [], finished: 0, alarms: 0, copies: 0 };

  const { data: orgRows, error: tickErr } = await admin.rpc("comms_queue_tick");
  if (tickErr) throw new Error(`comms_queue_tick failed: ${tickErr.message}`);
  const orgIds = ((orgRows ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : String(Object.values(r as object)[0])));
  result.orgs = orgIds.length;

  for (const orgId of orgIds) {
    if (now() - started > WORKER_BUDGET_MS) break;

    const settings = await loadOrgCommsSettings(admin, orgId);
    const blocked = sendBlocker(settings);
    if (blocked || !settings) {
      result.blocked.push({ orgId, reason: blocked ?? "Comms settings are missing." });
      continue;
    }
    const resolved = await transportFor(settings);
    if ("blocked" in resolved) {
      result.blocked.push({ orgId, reason: resolved.blocked });
      continue;
    }
    await drainOrg(admin, settings, resolved.transport, started, now, result);
  }

  const { data: finished, error: finErr } = await admin.rpc("finish_email_campaigns");
  if (finErr) console.error("[comms-queue] finish_email_campaigns failed:", finErr.message);
  result.finished = typeof finished === "number" ? finished : 0;

  // G4 safety nets. Isolated: a failure here never fails the tick's sends.
  try {
    result.copies = await sendLeadershipCopies();
  } catch (err) {
    console.error("[comms-queue] leadership copies failed:", err instanceof Error ? err.message : err);
  }
  try {
    result.alarms = await raiseAlarms(result.blocked);
  } catch (err) {
    console.error("[comms-queue] alarms failed:", err instanceof Error ? err.message : err);
  }
  return result;
}

async function drainOrg(
  admin: Admin,
  settings: OrgCommsSettings,
  transport: Transport,
  started: number,
  now: () => number,
  result: DrainResult
): Promise<void> {
  const orgId = settings.org_id;
  const pace = PACE[transport.kind];
  const campaigns = new Map<string, CampaignContent | null>();

  // Batches until the org runs out of work, cap or time.
  while (now() - started < WORKER_BUDGET_MS) {
    const { data, error } = await admin.rpc("claim_email_sends", { p_org: orgId, p_limit: pace.batch });
    if (error) {
      console.error(`[comms-queue] claim failed for org ${orgId}:`, error.message);
      return;
    }
    const rows = (data ?? []) as ClaimedRow[];
    if (rows.length === 0) return;

    const suppressed = await suppressedEmails(admin, orgId, rows);
    let stop = false;

    for (let i = 0; i < rows.length; i += pace.concurrency) {
      const slice = rows.slice(i, i + pace.concurrency);
      // Out of time or the sender stopped: hand the rest back untouched.
      if (stop || now() - started > WORKER_BUDGET_MS) {
        await requeue(admin, orgId, slice.map((r) => r.id));
        result.requeued += slice.length;
        continue;
      }
      const outcomes = await Promise.all(
        slice.map((row) => sendOne(admin, settings, transport, row, suppressed, campaigns))
      );
      for (const o of outcomes) {
        result[o.counter] += 1;
        if (o.stopOrg) stop = true;
      }
      if (pace.gapMs) await sleep(pace.gapMs);
    }
    if (stop) return;
  }
}

type Outcome = { counter: "sent" | "failed" | "unknown" | "suppressed" | "requeued"; stopOrg: boolean };

async function sendOne(
  admin: Admin,
  settings: OrgCommsSettings,
  transport: Transport,
  row: ClaimedRow,
  suppressed: Set<string>,
  campaigns: Map<string, CampaignContent | null>
): Promise<Outcome> {
  const finish = (patch: Record<string, unknown>) =>
    admin.from("email_sends").update(patch).eq("org_id", row.org_id).eq("id", row.id);

  // Unsubscribed or marked do-not-contact since the campaign was queued.
  if (suppressed.has(row.email.toLowerCase())) {
    await finish({ status: "suppressed", error: "Opted out or marked do not contact after this was queued." });
    return { counter: "suppressed", stopOrg: false };
  }

  const content = await campaignContent(admin, row.org_id, row.campaign_id, campaigns);
  if (!content) {
    await finish({ status: "failed", error: "The campaign could not be loaded." });
    return { counter: "failed", stopOrg: false };
  }

  // Rows queued before G3 have no token; give them one so they track too.
  let trackingToken = row.tracking_token;
  if (!trackingToken) {
    trackingToken = newTrackingToken();
    await admin.from("email_sends").update({ tracking_token: trackingToken }).eq("org_id", row.org_id).eq("id", row.id);
  }

  try {
    const email = buildCampaignEmail({
      settings,
      to: row.email,
      subject: content.subject,
      bodyText: personalize(content.body, row.first_name ?? ""),
      constituentId: row.constituent_id,
      campaignId: row.campaign_id,
      trackingToken,
    });
    const { providerMessageId } = await transport.send(email);
    await finish({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: providerMessageId, error: null });
    return { counter: "sent", stopOrg: false };
  } catch (err) {
    const failure = err instanceof TransportError ? err.failure : "unknown";
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const { status, stopOrg } = outcomeFor(failure);
    if (status === "pending") {
      await finish({ status: "pending", claimed_at: null, error: message });
      return { counter: "requeued", stopOrg };
    }
    await finish({ status, error: message });
    return { counter: status === "unknown" ? "unknown" : "failed", stopOrg };
  }
}

async function requeue(admin: Admin, orgId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from("email_sends")
    .update({ status: "pending", claimed_at: null })
    .eq("org_id", orgId)
    .in("id", ids)
    .eq("status", "sending");
  if (error) console.error(`[comms-queue] requeue failed for org ${orgId}:`, error.message);
}

/** Addresses in this batch that must not get mail any more: suppressed for
 *  this org, or whose constituent is now do-not-contact. */
async function suppressedEmails(admin: Admin, orgId: string, rows: ClaimedRow[]): Promise<Set<string>> {
  const out = new Set<string>();
  const emails = rows.map((r) => r.email);
  const { data: sup } = await admin.from("email_suppressions").select("email").eq("org_id", orgId).in("email", emails);
  for (const s of (sup ?? []) as Array<{ email: string }>) out.add(s.email.toLowerCase());

  const ids = rows.map((r) => r.constituent_id).filter((id): id is string => !!id);
  if (ids.length) {
    const { data: dnc } = await admin
      .from("constituents")
      .select("id")
      .eq("org_id", orgId)
      .in("id", ids)
      .eq("do_not_contact", true);
    const dncIds = new Set(((dnc ?? []) as Array<{ id: string }>).map((c) => c.id));
    for (const r of rows) if (r.constituent_id && dncIds.has(r.constituent_id)) out.add(r.email.toLowerCase());
  }
  return out;
}

async function campaignContent(
  admin: Admin,
  orgId: string,
  campaignId: string,
  cache: Map<string, CampaignContent | null>
): Promise<CampaignContent | null> {
  if (cache.has(campaignId)) return cache.get(campaignId) ?? null;
  const { data } = await admin
    .from("email_campaigns")
    .select("subject, body")
    .eq("org_id", orgId)
    .eq("id", campaignId)
    .maybeSingle();
  const content = data ? { subject: data.subject as string, body: data.body as string } : null;
  cache.set(campaignId, content);
  return content;
}
