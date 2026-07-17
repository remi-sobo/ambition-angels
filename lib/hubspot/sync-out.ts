import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hubspotPost, hubspotPatch } from "./client";
import { hubspotWriteEnabled, hubspotGiftDealsEnabled } from "./connection";

/**
 * Outbound sync: BloomOS → HubSpot (slice 1 — Contacts & Companies).
 *
 * Best-effort and fail-soft: every entry point is gated by
 * hubspotWriteEnabled() (standalone orgs no-op), and all network errors are
 * caught and logged rather than thrown, so a HubSpot hiccup never breaks the
 * local write that triggered the push. Field mappings mirror the read sync
 * in lib/hubspot/upserts.ts so a round-trip is stable.
 *
 * Linkage: a person stores its HubSpot contact id in
 * `constituents.external_ids.hubspot`; an organization stores its company id
 * in `external_ids.hubspot_company`. First push creates the remote record and
 * writes the id back; later pushes PATCH it.
 *
 * Follow-ups (tracked in the roadmap): durable retry queue, upsert-by-email
 * to avoid duplicate contacts, interactions→engagements, gifts/opps→deals,
 * and the inbound webhook apply path.
 */

type ConstituentRow = {
  id: string;
  type: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  emails: string[] | null;
  phones: string[] | null;
  external_ids: Record<string, unknown> | null;
};

export async function pushConstituentToHubSpot(constituentId: string): Promise<void> {
  if (!(await hubspotWriteEnabled())) return; // standalone → no-op

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("constituents")
    .select("id, type, first_name, last_name, org_name, emails, phones, external_ids")
    .eq("id", constituentId)
    .maybeSingle();
  if (error || !data) return;
  const c = data as ConstituentRow;
  const extIds = (c.external_ids ?? {}) as Record<string, unknown>;

  try {
    if (c.type === "organization") {
      const props: Record<string, string> = {};
      if (c.org_name) props.name = c.org_name;
      if (Object.keys(props).length === 0) return;
      const hsId = typeof extIds.hubspot_company === "string" ? extIds.hubspot_company : null;
      if (hsId) {
        await hubspotPatch(`/crm/v3/objects/companies/${hsId}`, { properties: props });
      } else {
        const created = await hubspotPost<{ id: string }>("/crm/v3/objects/companies", { properties: props });
        await admin
          .from("constituents")
          .update({ external_ids: { ...extIds, hubspot_company: created.id } })
          .eq("id", c.id);
      }
      return;
    }

    // Person → Contact.
    const props: Record<string, string> = {};
    if (c.first_name) props.firstname = c.first_name;
    if (c.last_name) props.lastname = c.last_name;
    if (c.emails && c.emails[0]) props.email = c.emails[0];
    if (c.phones && c.phones[0]) props.phone = c.phones[0];
    if (Object.keys(props).length === 0) return;
    const hsId = typeof extIds.hubspot === "string" ? extIds.hubspot : null;
    if (hsId) {
      await hubspotPatch(`/crm/v3/objects/contacts/${hsId}`, { properties: props });
    } else {
      const created = await hubspotPost<{ id: string }>("/crm/v3/objects/contacts", { properties: props });
      await admin
        .from("constituents")
        .update({ external_ids: { ...extIds, hubspot: created.id } })
        .eq("id", c.id);
    }
  } catch (e) {
    console.error("[hubspot] outbound push failed:", (e as Error).message);
  }
}

// ── Interactions → Engagements (X3) ─────────────────────────────────────────

// HubSpot-defined association type ids, engagement → contact.
const ENGAGEMENT_TO_CONTACT: Record<string, number> = {
  call: 194,
  meeting: 200,
  email: 198,
  note: 202,
};

// Map a BloomOS interaction kind to its HubSpot engagement object + property
// shape. 'event' has no native engagement type, so it lands as a note.
function engagementFor(
  kind: string,
  notes: string | null,
  isoTs: string
): { path: string; properties: Record<string, string>; assocTypeId: number } {
  const body = (notes && notes.trim()) || `${kind[0].toUpperCase()}${kind.slice(1)} logged`;
  switch (kind) {
    case "call":
      return {
        path: "/crm/v3/objects/calls",
        properties: { hs_timestamp: isoTs, hs_call_title: "Call", hs_call_body: body },
        assocTypeId: ENGAGEMENT_TO_CONTACT.call,
      };
    case "meeting":
      return {
        path: "/crm/v3/objects/meetings",
        properties: { hs_timestamp: isoTs, hs_meeting_title: "Meeting", hs_meeting_body: body },
        assocTypeId: ENGAGEMENT_TO_CONTACT.meeting,
      };
    case "email":
      return {
        path: "/crm/v3/objects/emails",
        properties: { hs_timestamp: isoTs, hs_email_subject: "Email", hs_email_text: body },
        assocTypeId: ENGAGEMENT_TO_CONTACT.email,
      };
    default: // note + event
      return {
        path: "/crm/v3/objects/notes",
        properties: { hs_timestamp: isoTs, hs_note_body: kind === "event" ? `[Event] ${body}` : body },
        assocTypeId: ENGAGEMENT_TO_CONTACT.note,
      };
  }
}

type InteractionRow = {
  id: string;
  constituent_id: string;
  kind: string;
  occurred_at: string;
  notes: string | null;
};

/**
 * Outbound: a logged interaction → a HubSpot engagement on the donor's
 * contact timeline. Gated + fail-soft like the constituent push.
 *
 * Interactions are append-only (created once, no edit/delete UI), so a single
 * push on creation can't create duplicates — we therefore don't store the
 * engagement id back. If the donor has no HubSpot contact yet, we create one
 * first (pushConstituentToHubSpot) so the engagement has something to attach
 * to; if it still can't be resolved, we skip.
 */
export async function pushInteractionToHubSpot(interactionId: string): Promise<void> {
  if (!(await hubspotWriteEnabled())) return; // standalone → no-op

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("interactions")
    .select("id, constituent_id, kind, occurred_at, notes")
    .eq("id", interactionId)
    .maybeSingle();
  if (error || !data) return;
  const i = data as InteractionRow;

  try {
    // Resolve (or create) the donor's HubSpot contact id.
    const readContactId = async (): Promise<string | null> => {
      const { data: c } = await admin
        .from("constituents")
        .select("external_ids")
        .eq("id", i.constituent_id)
        .maybeSingle();
      const ext = (c?.external_ids ?? {}) as Record<string, unknown>;
      return typeof ext.hubspot === "string" ? ext.hubspot : null;
    };
    let contactId = await readContactId();
    if (!contactId) {
      await pushConstituentToHubSpot(i.constituent_id);
      contactId = await readContactId();
    }
    if (!contactId) return; // org-only or unsyncable — nothing to attach to

    const isoTs = (() => {
      const t = Date.parse(i.occurred_at);
      return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
    })();
    const { path, properties, assocTypeId } = engagementFor(i.kind, i.notes, isoTs);

    await hubspotPost(path, {
      properties,
      associations: [
        {
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: assocTypeId }],
        },
      ],
    });
  } catch (e) {
    console.error("[hubspot] interaction push failed:", (e as Error).message);
  }
}

// ── Gifts & Opportunities → Deals (X4) ──────────────────────────────────────
// HubSpot has no native gift object, so both map to Deals. Deal→Contact
// association type id is 3 (HUBSPOT_DEFINED).

const DEAL_TO_CONTACT = 3;

// Legacy moves-management stages → HubSpot's out-of-the-box default-pipeline
// deal stages. LAST-RESORT fallback only: the real mapping is per-org config
// (pipeline_stages.external_stage_id, looked up by dealstageFor below).
const OPP_STAGE_TO_DEALSTAGE: Record<string, string> = {
  identify: "appointmentscheduled",
  qualify: "qualifiedtobuy",
  cultivate: "presentationscheduled",
  solicit: "decisionmakerboughtin",
  steward: "closedwon",
  lost: "closedlost",
};

// Translate a Bloom stage key to the HubSpot dealstage internal id via the
// org's pipeline_stages config. Null when the stage has no HubSpot counterpart
// (e.g. a config row with external_stage_id unset) — callers must no-op on
// null rather than push a wrong stage.
async function dealstageFor(
  admin: ReturnType<typeof getSupabaseAdmin>,
  orgId: string,
  pipeline: string,
  stageKey: string
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("pipeline_stages")
      .select("external_stage_id")
      .eq("org_id", orgId)
      .eq("pipeline", pipeline)
      .eq("key", stageKey)
      .maybeSingle();
    return typeof data?.external_stage_id === "string" && data.external_stage_id !== ""
      ? data.external_stage_id
      : null;
  } catch {
    return null; // config tables absent → treat as unmapped
  }
}

// Resolve a constituent's HubSpot contact id, creating the contact first if it
// doesn't exist yet so the deal has something to associate to.
async function ensureContactId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  constituentId: string
): Promise<string | null> {
  const read = async (): Promise<string | null> => {
    const { data } = await admin
      .from("constituents")
      .select("external_ids")
      .eq("id", constituentId)
      .maybeSingle();
    const ext = (data?.external_ids ?? {}) as Record<string, unknown>;
    return typeof ext.hubspot === "string" ? ext.hubspot : null;
  };
  let id = await read();
  if (!id) {
    await pushConstituentToHubSpot(constituentId);
    id = await read();
  }
  return id;
}

/**
 * A recorded gift → a closed-won Deal. Opt-in (hubspotGiftDealsEnabled).
 * Push-on-create only (gifts aren't re-pushed), so no deal id is stored back.
 * Anonymous gifts have no contact and are skipped.
 */
export async function pushGiftToHubSpot(giftId: string): Promise<void> {
  if (!(await hubspotGiftDealsEnabled())) return;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("gifts")
    .select("id, constituent_id, amount, gift_date")
    .eq("id", giftId)
    .maybeSingle();
  if (error || !data) return;
  const g = data as { id: string; constituent_id: string | null; amount: number; gift_date: string };
  if (!g.constituent_id) return;

  try {
    const contactId = await ensureContactId(admin, g.constituent_id);
    if (!contactId) return;
    await hubspotPost("/crm/v3/objects/deals", {
      properties: {
        dealname: `Gift ${g.gift_date}`,
        amount: String(g.amount),
        dealstage: "closedwon",
        pipeline: "default",
        closedate: g.gift_date,
      },
      associations: [
        { to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] },
      ],
    });
  } catch (e) {
    console.error("[hubspot] gift→deal push failed:", (e as Error).message);
  }
}

/**
 * An opportunity → a Deal. Gated by hubspotWriteEnabled (connections.meta
 * sync_out). Two shapes:
 *
 *   * HUBSPOT-LINKED deal (external_source='hubspot', external_id set — it
 *     came in via the inbound sync): the push is deliberately NARROW — one
 *     deal, one field. We translate the Bloom stage key to the HubSpot
 *     dealstage id via pipeline_stages config and PATCH only `dealstage`;
 *     amount/close/owner keep flowing inbound as before. A stage with no
 *     external_stage_id (e.g. Identified/Researched before their ids were
 *     confirmed) no-ops rather than pushing a wrong stage.
 *
 *   * BLOOM-NATIVE opportunity: first push creates the remote deal (id stored
 *     in external_ids.hubspot_deal), later pushes PATCH it — the pre-existing
 *     flow, now with the dealstage looked up from config first.
 */
export async function pushOpportunityToHubSpot(opportunityId: string): Promise<void> {
  if (!(await hubspotWriteEnabled())) return;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("opportunities")
    .select(
      "id, org_id, constituent_id, name, stage, pipeline, ask_amount, expected_close, external_source, external_id, external_ids"
    )
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !data) return;
  const o = data as {
    id: string; org_id: string; constituent_id: string; name: string | null;
    stage: string; pipeline: string | null;
    ask_amount: number | null; expected_close: string | null;
    external_source: string | null; external_id: string | null;
    external_ids: Record<string, unknown> | null;
  };
  const pipeline = o.pipeline ?? "default";

  try {
    // HubSpot-linked deal → narrow stage-only push.
    if (o.external_source === "hubspot" && o.external_id) {
      const dealstage = await dealstageFor(admin, o.org_id, pipeline, o.stage);
      if (!dealstage) return; // unmapped stage → no-op, never guess
      await hubspotPatch(`/crm/v3/objects/deals/${o.external_id}`, {
        properties: { dealstage },
      });
      return;
    }

    const configStage = await dealstageFor(admin, o.org_id, pipeline, o.stage);
    const properties: Record<string, string> = {
      dealname: o.name || "Major-gift opportunity",
      dealstage: configStage ?? OPP_STAGE_TO_DEALSTAGE[o.stage] ?? "appointmentscheduled",
      pipeline: "default",
    };
    if (o.ask_amount != null) properties.amount = String(o.ask_amount);
    if (o.expected_close) properties.closedate = o.expected_close;

    const ext = (o.external_ids ?? {}) as Record<string, unknown>;
    const dealId = typeof ext.hubspot_deal === "string" ? ext.hubspot_deal : null;
    if (dealId) {
      await hubspotPatch(`/crm/v3/objects/deals/${dealId}`, { properties });
      return;
    }

    const contactId = o.constituent_id ? await ensureContactId(admin, o.constituent_id) : null;
    const created = await hubspotPost<{ id: string }>("/crm/v3/objects/deals", {
      properties,
      associations: contactId
        ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] }]
        : undefined,
    });
    await admin
      .from("opportunities")
      .update({ external_ids: { ...ext, hubspot_deal: created.id } })
      .eq("id", o.id);
  } catch (e) {
    console.error("[hubspot] opportunity→deal push failed:", (e as Error).message);
  }
}
