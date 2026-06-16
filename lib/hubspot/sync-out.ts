import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hubspotPost, hubspotPatch } from "./client";
import { hubspotWriteEnabled } from "./connection";

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
