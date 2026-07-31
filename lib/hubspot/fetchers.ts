/**
 * HubSpot v3 CRM object fetchers, all paginated.
 *
 * Each fetcher requests one page (default 100 records, HubSpot's max),
 * returns the records plus the next-page cursor. Caller drives the loop;
 * we never page through everything in a single call.
 *
 * Properties are explicitly enumerated in the URL because HubSpot's
 * default property set is unstable across endpoints.
 *
 * Engagements (emails / calls / meetings / notes / tasks) live at separate
 * v3 endpoints. The sync route iterates the five sub-types in order and
 * encodes which sub-type is in flight in the job's `cursors.engagements`
 * field as a "<subtype>:<after>" string.
 */

import { hubspotGet, hubspotSearch } from "./client";

// ── Shared shapes ──────────────────────────────────────────────────────────

export type HubSpotRecord = {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<
    string,
    { results: Array<{ id: string; type?: string }> }
  >;
  // HubSpot also returns createdAt / updatedAt at the top level; we mostly
  // read from properties, so we leave them in raw_json instead of typing.
  [key: string]: unknown;
};

export type Page<T = HubSpotRecord> = {
  records: T[];
  nextCursor: string | null;
};

const PAGE_SIZE = 100;

type V3Response = {
  results: HubSpotRecord[];
  paging?: { next?: { after?: string } };
};

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Property lists per object ──────────────────────────────────────────────

const CONTACT_PROPS = [
  "email",
  "firstname",
  "lastname",
  "phone",
  "company",
  "lifecyclestage",
  "hs_lead_status",
  "hubspot_owner_id",
  "notes_last_updated",
  "createdate",
].join(",");

const COMPANY_PROPS = [
  "name",
  "domain",
  "industry",
  "hubspot_owner_id",
  "hs_last_activity_date",
  "createdate",
].join(",");

const DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
  "hubspot_owner_id",
  "hs_last_activity_date",
  "createdate",
].join(",");

const EMAIL_PROPS = [
  "hs_email_subject",
  "hs_email_text",
  "hs_email_html",
  "hs_timestamp",
  "hubspot_owner_id",
].join(",");

const CALL_PROPS = [
  "hs_call_title",
  "hs_call_body",
  "hs_timestamp",
  "hubspot_owner_id",
].join(",");

const MEETING_PROPS = [
  "hs_meeting_title",
  "hs_meeting_body",
  "hs_timestamp",
  "hs_meeting_start_time",
  "hubspot_owner_id",
].join(",");

const NOTE_PROPS = [
  "hs_note_body",
  "hs_timestamp",
  "hubspot_owner_id",
].join(",");

const TASK_PROPS = [
  "hs_task_subject",
  "hs_task_body",
  "hs_timestamp",
  "hubspot_owner_id",
].join(",");

// ── Generic page fetcher ───────────────────────────────────────────────────

async function fetchPage(
  endpoint: string,
  properties: string,
  associations: string | undefined,
  cursor: string | null
): Promise<Page> {
  const path =
    endpoint +
    buildQuery({
      limit: String(PAGE_SIZE),
      properties,
      associations,
      after: cursor ?? undefined,
      archived: "false",
    });
  const res = await hubspotGet<V3Response>(path);
  return {
    records: res.results ?? [],
    nextCursor: res.paging?.next?.after ?? null,
  };
}

// ── Public fetchers ────────────────────────────────────────────────────────

export function fetchContacts(cursor: string | null): Promise<Page> {
  return fetchPage("/crm/v3/objects/contacts", CONTACT_PROPS, undefined, cursor);
}

export function fetchCompanies(cursor: string | null): Promise<Page> {
  return fetchPage("/crm/v3/objects/companies", COMPANY_PROPS, undefined, cursor);
}

export function fetchDeals(cursor: string | null): Promise<Page> {
  return fetchPage(
    "/crm/v3/objects/deals",
    DEAL_PROPS,
    "contacts,companies",
    cursor
  );
}

export type EngagementSubtype = "emails" | "calls" | "meetings" | "notes" | "tasks";
export const ENGAGEMENT_SUBTYPES: EngagementSubtype[] = [
  "emails",
  "calls",
  "meetings",
  "notes",
  "tasks",
];

const ENGAGEMENT_PROPS: Record<EngagementSubtype, string> = {
  emails: EMAIL_PROPS,
  calls: CALL_PROPS,
  meetings: MEETING_PROPS,
  notes: NOTE_PROPS,
  tasks: TASK_PROPS,
};

export function fetchEngagements(
  subtype: EngagementSubtype,
  cursor: string | null
): Promise<Page> {
  return fetchPage(
    `/crm/v3/objects/${subtype}`,
    ENGAGEMENT_PROPS[subtype],
    "contacts,companies,deals",
    cursor
  );
}

// ── Totals (for "X of Y synced" progress) ───────────────────────────────────
//
// The paginated list endpoints above never report a grand total, so the sync
// UI could only ever show "N synced so far" with no denominator to compare
// it against. HubSpot's search endpoint returns a `total` field even with an
// empty filter — one cheap call (limit 1, no properties) gets an accurate
// count without paging through everything.

type SearchTotalResponse = { total?: number };

async function fetchObjectTotal(objectType: string): Promise<number> {
  const res = await hubspotSearch<SearchTotalResponse>(
    `/crm/v3/objects/${objectType}/search`,
    { limit: 1, filterGroups: [] }
  );
  return res.total ?? 0;
}

export function fetchContactsTotal(): Promise<number> {
  return fetchObjectTotal("contacts");
}

export function fetchCompaniesTotal(): Promise<number> {
  return fetchObjectTotal("companies");
}

export function fetchDealsTotal(): Promise<number> {
  return fetchObjectTotal("deals");
}

export async function fetchEngagementsTotal(): Promise<number> {
  const perSubtype = await Promise.all(ENGAGEMENT_SUBTYPES.map(fetchObjectTotal));
  return perSubtype.reduce((sum, n) => sum + n, 0);
}
