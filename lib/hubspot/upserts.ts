/**
 * Upserters from HubSpot v3 records into the hs_* mirror tables.
 *
 * Each function maps the HubSpot record's promoted properties to typed
 * columns, sets synced_at = now(), and stuffs the full response into
 * raw_json. ON CONFLICT (hubspot_id) DO UPDATE means a re-sync refreshes
 * existing rows in place.
 *
 * Missing fields are mapped to null — never throws on a partial record.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { HubSpotRecord, EngagementSubtype } from "./fetchers";

// ── Helpers ────────────────────────────────────────────────────────────────

function str(props: Record<string, string | null>, key: string): string | null {
  const v = props[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function tsz(props: Record<string, string | null>, key: string): string | null {
  // HubSpot timestamps come as ISO strings or ms-epoch strings. Postgres
  // timestamptz happily parses ISO; epoch numbers we coerce to ISO.
  const v = props[key];
  if (!v) return null;
  if (/^\d+$/.test(v)) return new Date(Number(v)).toISOString();
  return v;
}

function date(props: Record<string, string | null>, key: string): string | null {
  const v = props[key];
  if (!v) return null;
  // Already a date or datetime string; Postgres `date` will truncate.
  return v.slice(0, 10);
}

function num(props: Record<string, string | null>, key: string): number | null {
  const v = props[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function assocIds(rec: HubSpotRecord, key: string): string[] {
  const list = rec.associations?.[key]?.results ?? [];
  return list.map((r) => r.id).filter((id): id is string => typeof id === "string");
}

function stripHtml(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null;
}

const SYNCED_AT = () => new Date().toISOString();

// ── Contacts ───────────────────────────────────────────────────────────────

export async function upsertContacts(records: HubSpotRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const rows = records.map((r) => ({
    hubspot_id: r.id,
    email: str(r.properties, "email"),
    first_name: str(r.properties, "firstname"),
    last_name: str(r.properties, "lastname"),
    phone: str(r.properties, "phone"),
    company: str(r.properties, "company"),
    lifecycle_stage: str(r.properties, "lifecyclestage"),
    lead_status: str(r.properties, "hs_lead_status"),
    owner_id: str(r.properties, "hubspot_owner_id"),
    last_activity_at: tsz(r.properties, "notes_last_updated"),
    created_in_hubspot_at: tsz(r.properties, "createdate"),
    synced_at: SYNCED_AT(),
    raw_json: r,
    updated_at: SYNCED_AT(),
  }));
  const { error } = await getSupabaseAdmin()
    .from("hs_contacts")
    .upsert(rows, { onConflict: "hubspot_id" });
  if (error) throw new Error(`hs_contacts upsert failed: ${error.message}`);
  return rows.length;
}

// ── Companies ──────────────────────────────────────────────────────────────

export async function upsertCompanies(records: HubSpotRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const rows = records.map((r) => ({
    hubspot_id: r.id,
    name: str(r.properties, "name"),
    domain: str(r.properties, "domain"),
    industry: str(r.properties, "industry"),
    owner_id: str(r.properties, "hubspot_owner_id"),
    last_activity_at: tsz(r.properties, "hs_last_activity_date"),
    created_in_hubspot_at: tsz(r.properties, "createdate"),
    synced_at: SYNCED_AT(),
    raw_json: r,
    updated_at: SYNCED_AT(),
  }));
  const { error } = await getSupabaseAdmin()
    .from("hs_companies")
    .upsert(rows, { onConflict: "hubspot_id" });
  if (error) throw new Error(`hs_companies upsert failed: ${error.message}`);
  return rows.length;
}

// ── Deals ──────────────────────────────────────────────────────────────────

export async function upsertDeals(records: HubSpotRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  const rows = records.map((r) => {
    const contactIds = assocIds(r, "contacts");
    const companyIds = assocIds(r, "companies");
    return {
      hubspot_id: r.id,
      name: str(r.properties, "dealname"),
      amount: num(r.properties, "amount"),
      stage: str(r.properties, "dealstage"),
      pipeline: str(r.properties, "pipeline"),
      close_date: date(r.properties, "closedate"),
      owner_id: str(r.properties, "hubspot_owner_id"),
      primary_contact_id: contactIds[0] ?? null,
      primary_company_id: companyIds[0] ?? null,
      last_activity_at: tsz(r.properties, "hs_last_activity_date"),
      created_in_hubspot_at: tsz(r.properties, "createdate"),
      synced_at: SYNCED_AT(),
      raw_json: r,
      updated_at: SYNCED_AT(),
    };
  });
  const { error } = await getSupabaseAdmin()
    .from("hs_deals")
    .upsert(rows, { onConflict: "hubspot_id" });
  if (error) throw new Error(`hs_deals upsert failed: ${error.message}`);
  return rows.length;
}

// ── Engagements ────────────────────────────────────────────────────────────

const ENGAGEMENT_TYPE_FOR_SUBTYPE: Record<EngagementSubtype, string> = {
  emails: "email",
  calls: "call",
  meetings: "meeting",
  notes: "note",
  tasks: "task",
};

function engagementSubject(
  subtype: EngagementSubtype,
  props: Record<string, string | null>
): string | null {
  if (subtype === "emails") return str(props, "hs_email_subject");
  if (subtype === "meetings") return str(props, "hs_meeting_title");
  if (subtype === "calls") return str(props, "hs_call_title");
  if (subtype === "tasks") return str(props, "hs_task_subject");
  // notes: derive from first 80 chars of body, HTML-stripped
  const body = stripHtml(str(props, "hs_note_body"));
  return body ? body.slice(0, 80) : null;
}

function engagementBodyPreview(
  subtype: EngagementSubtype,
  props: Record<string, string | null>
): string | null {
  const raw =
    subtype === "emails"
      ? str(props, "hs_email_text") ?? str(props, "hs_email_html")
      : subtype === "calls"
      ? str(props, "hs_call_body")
      : subtype === "meetings"
      ? str(props, "hs_meeting_body")
      : subtype === "notes"
      ? str(props, "hs_note_body")
      : str(props, "hs_task_body");
  const stripped = stripHtml(raw);
  return stripped ? stripped.slice(0, 500) : null;
}

export type EngagementUpsertResult = {
  inserted: number;
  failed: Array<{
    hubspot_id: string;
    // The HubSpot v3 sub-type (emails / calls / meetings / notes / tasks)
    // that the bad record came from — same value used in the cursor.
    subtype: EngagementSubtype;
    error_message: string;
  }>;
};

// TODO: investigate which HubSpot field contains the bad JSON; common
// culprits are null bytes (\u0000) in body fields, NaN/Infinity in numeric
// columns inside raw_json, or invalid UTF-8 in subject lines. Surfacing
// the failed hubspot_ids via per-record fallback gives us a way to inspect
// real offenders later without sanitizing in flight.
function isJsonInputError(message: string): boolean {
  return /invalid input syntax for type json/i.test(message);
}

export async function upsertEngagements(
  subtype: EngagementSubtype,
  records: HubSpotRecord[]
): Promise<EngagementUpsertResult> {
  if (records.length === 0) return { inserted: 0, failed: [] };
  const type = ENGAGEMENT_TYPE_FOR_SUBTYPE[subtype];
  const rows = records.map((r) => ({
    hubspot_id: r.id,
    engagement_type: type,
    subject: engagementSubject(subtype, r.properties),
    body_preview: engagementBodyPreview(subtype, r.properties),
    occurred_at: tsz(r.properties, "hs_timestamp"),
    owner_id: str(r.properties, "hubspot_owner_id"),
    contact_ids: assocIds(r, "contacts"),
    company_ids: assocIds(r, "companies"),
    deal_ids: assocIds(r, "deals"),
    synced_at: SYNCED_AT(),
    raw_json: r,
    updated_at: SYNCED_AT(),
  }));

  // Fast path: try the whole batch in one round trip.
  const { error } = await getSupabaseAdmin()
    .from("hs_engagements")
    .upsert(rows, { onConflict: "hubspot_id" });
  if (!error) return { inserted: rows.length, failed: [] };

  // If the batch failed for a reason other than a malformed JSON value,
  // re-throw — we don't want per-record retries to mask a real outage.
  if (!isJsonInputError(error.message)) {
    throw new Error(`hs_engagements upsert failed: ${error.message}`);
  }

  // Slow path: at least one record carries something Postgres rejects
  // inside raw_json. Re-upsert each row individually so the good ones
  // land and we get hubspot_ids for the bad ones.
  const failed: EngagementUpsertResult["failed"] = [];
  let inserted = 0;
  for (const row of rows) {
    const { error: rowErr } = await getSupabaseAdmin()
      .from("hs_engagements")
      .upsert(row, { onConflict: "hubspot_id" });
    if (rowErr) {
      failed.push({
        hubspot_id: row.hubspot_id,
        subtype,
        error_message: rowErr.message,
      });
    } else {
      inserted++;
    }
  }
  return { inserted, failed };
}
