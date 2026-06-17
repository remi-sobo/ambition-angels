import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hubspotGet } from "./client";
import { upsertContacts, upsertCompanies } from "./upserts";
import type { HubSpotRecord } from "./fetchers";

/**
 * Inbound sync: HubSpot → BloomOS (X6). When a connected HubSpot reports a
 * contact/company change, we refresh the read mirror (hs_*) and apply the
 * HubSpot-owned contact fields to the linked constituent.
 *
 * System of record stays BloomOS: this only touches contact details, never the
 * gifts spine / revenue. Best-effort; the webhook route catches per-event.
 */

const CONTACT_PROPS = [
  "email", "firstname", "lastname", "phone", "company",
  "lifecyclestage", "hs_lead_status", "hubspot_owner_id", "notes_last_updated", "createdate",
].join(",");
const COMPANY_PROPS = ["name", "domain", "industry", "hubspot_owner_id", "hs_last_activity_date", "createdate"].join(",");

const str = (p: Record<string, string | null>, k: string): string | null =>
  typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : null;

export async function applyContactFromHubSpot(objectId: string): Promise<void> {
  const rec = await hubspotGet<HubSpotRecord>(`/crm/v3/objects/contacts/${objectId}?properties=${CONTACT_PROPS}`);
  await upsertContacts([rec]); // keep the prospect-research mirror current

  const admin = getSupabaseAdmin();
  const { data: c } = await admin
    .from("constituents")
    .select("id")
    .eq("external_ids->>hubspot", objectId)
    .maybeSingle();
  if (!c) return; // not linked to a constituent — mirror refresh is enough

  const p = rec.properties ?? {};
  const update: Record<string, unknown> = {};
  const first = str(p, "firstname");
  const last = str(p, "lastname");
  const email = str(p, "email");
  const phone = str(p, "phone");
  if (first) update.first_name = first;
  if (last) update.last_name = last;
  if (email) update.emails = [email];
  if (phone) update.phones = [phone];
  if (Object.keys(update).length > 0) {
    await admin.from("constituents").update(update).eq("id", c.id);
  }
}

export async function applyCompanyFromHubSpot(objectId: string): Promise<void> {
  const rec = await hubspotGet<HubSpotRecord>(`/crm/v3/objects/companies/${objectId}?properties=${COMPANY_PROPS}`);
  await upsertCompanies([rec]);

  const admin = getSupabaseAdmin();
  const { data: c } = await admin
    .from("constituents")
    .select("id")
    .eq("external_ids->>hubspot_company", objectId)
    .maybeSingle();
  if (!c) return;

  const name = str(rec.properties ?? {}, "name");
  if (name) await admin.from("constituents").update({ org_name: name }).eq("id", c.id);
}
