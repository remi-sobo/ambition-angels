import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildCampaignEmail } from "@/lib/fundraising/comms-email";
import { mergeText, EMPTY_MERGE, type MergeData } from "./merge";
import { loadOrgCommsSettings, sendBlocker, type OrgCommsSettings } from "./settings";
import { transportFor, TransportError, type Transport } from "./transport";
import { outcomeFor, PACE, WORKER_BUDGET_MS } from "./queue-plan";
import { newTrackingToken } from "./links";
import { raiseAlarms, sendLeadershipCopies } from "./safety";
import { campaignStoryBlock } from "./story-gate";

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

/** `storyBlock` is set when the campaign carries a story that may no longer
 *  go out (consent revoked or expired since compile). Every copy is then
 *  skipped with that reason; nothing is retried on its own. */
type CampaignContent = { subject: string; body: string; storyBlock: string | null };

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
    const mergeData = await mergeDataFor(admin, orgId, rows);
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
        slice.map((row) => sendOne(admin, settings, transport, row, suppressed, campaigns, mergeData))
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
  campaigns: Map<string, CampaignContent | null>,
  mergeData: Map<string, MergeData>
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

  // V4 Stage D: consent is checked again at the moment of sending, once per
  // campaign per tick (cached with the content).
  if (content.storyBlock) {
    await finish({ status: "skipped", error: content.storyBlock.slice(0, 500) });
    return { counter: "suppressed", stopOrg: false };
  }

  // Rows queued before G3 have no token; give them one so they track too.
  let trackingToken = row.tracking_token;
  if (!trackingToken) {
    trackingToken = newTrackingToken();
    await admin.from("email_sends").update({ tracking_token: trackingToken }).eq("org_id", row.org_id).eq("id", row.id);
  }

  // Merge fields, from the person's record as it is now. A record that has
  // gone (archived since queueing) still has the first name saved at queue
  // time. A field with no value and no fallback never goes out blank.
  const data = (row.constituent_id && mergeData.get(row.constituent_id)) || { ...EMPTY_MERGE, first_name: row.first_name };
  const subject = mergeText(content.subject, data);
  const body = mergeText(content.body, data);
  const missing = [...subject.missing, ...body.missing];
  if (missing.length) {
    await finish({ status: "skipped", error: `Left out: no ${missing[0].replace(/_/g, " ")} on their record, and the email has no words to use instead.` });
    return { counter: "suppressed", stopOrg: false };
  }

  try {
    const email = buildCampaignEmail({
      settings,
      to: row.email,
      subject: subject.text,
      bodyText: body.text,
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

/** Merge-field data for a claimed batch, read live from the rollup view. */
async function mergeDataFor(admin: Admin, orgId: string, rows: ClaimedRow[]): Promise<Map<string, MergeData>> {
  const out = new Map<string, MergeData>();
  const ids = Array.from(new Set(rows.map((r) => r.constituent_id).filter((id): id is string => !!id)));
  if (ids.length === 0) return out;
  const { data, error } = await admin
    .from("v_fr_rollups")
    .select("id, first_name, last_name, org_name, lifetime_total, gift_count, last_gift")
    .eq("org_id", orgId)
    .in("id", ids);
  if (error) {
    console.error(`[comms-queue] merge data read failed for org ${orgId}:`, error.message);
    return out;
  }
  type R = { id: string; first_name: string | null; last_name: string | null; org_name: string | null; lifetime_total: number | null; gift_count: number | null; last_gift: string | null };
  for (const c of (data ?? []) as R[]) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.org_name || null;
    out.set(c.id, {
      first_name: c.first_name,
      last_name: c.last_name,
      full_name: full,
      last_gift: c.last_gift,
      lifetime_total: c.lifetime_total === null ? null : Number(c.lifetime_total),
      gift_count: c.gift_count === null ? null : Number(c.gift_count),
    });
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
  const content = data
    ? {
        subject: data.subject as string,
        body: data.body as string,
        storyBlock: await campaignStoryBlock(admin, orgId, campaignId),
      }
    : null;
  cache.set(campaignId, content);
  return content;
}
