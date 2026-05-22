import type { SupabaseClient } from "@supabase/supabase-js";

// Maps a HubSpot deal stage to a pledge bucket on /admin/finance/revenue.
//
// HubSpot stages come in three flavors depending on how the pipeline is
// configured:
//   1. Standard sales pipeline internal IDs: "closedwon", "qualifiedtobuy",
//      "appointmentscheduled", "presentationscheduled", "contractsent",
//      "decisionmakerboughtin", "closedlost".
//   2. Friendly labels on custom pipelines: "Closed Won", "Verbal Commit",
//      "Proposal Sent", etc.
//   3. Opaque numeric IDs on fully-custom pipelines: "1234567".
//
// We match on a normalized stage string (lowercase, alphanumeric only)
// against keyword sets. Anything we don't recognize is bucketed as
// "ignore" — won't roll into pledge totals. Specific overrides can be
// added later via a per-stage editor; for now the defaults handle the
// 95% case.

export type HubSpotPledgeStatus = "received" | "secured" | "projected" | "ignore";

export type StageMapping = {
  status: HubSpotPledgeStatus;
  probability: number; // only meaningful for "projected"
};

type Matcher = {
  // Keywords to look for in the normalized stage string. ALL must match.
  keywords: string[];
  result: StageMapping;
};

// Order matters — first matcher wins. Specific matchers go first.
const MATCHERS: Matcher[] = [
  // ── received ─────────────────────────────────────────────────────────
  { keywords: ["closedwon"], result: { status: "received", probability: 1.0 } },
  { keywords: ["closed", "won"], result: { status: "received", probability: 1.0 } },
  { keywords: ["received"], result: { status: "received", probability: 1.0 } },

  // ── secured (committed but not yet in the bank) ──────────────────────
  { keywords: ["contractsent"], result: { status: "secured", probability: 1.0 } },
  { keywords: ["verbal"], result: { status: "secured", probability: 1.0 } },
  { keywords: ["committed"], result: { status: "secured", probability: 1.0 } },
  { keywords: ["secured"], result: { status: "secured", probability: 1.0 } },
  { keywords: ["decisionmaker"], result: { status: "secured", probability: 0.9 } },

  // ── projected (pipeline, weighted) ───────────────────────────────────
  { keywords: ["presentationscheduled"], result: { status: "projected", probability: 0.5 } },
  { keywords: ["proposal"], result: { status: "projected", probability: 0.5 } },
  { keywords: ["negotiation"], result: { status: "projected", probability: 0.5 } },
  { keywords: ["qualifiedtobuy"], result: { status: "projected", probability: 0.25 } },
  { keywords: ["qualified"], result: { status: "projected", probability: 0.25 } },
  { keywords: ["appointment"], result: { status: "projected", probability: 0.1 } },
  { keywords: ["discovery"], result: { status: "projected", probability: 0.1 } },
  { keywords: ["interested"], result: { status: "projected", probability: 0.1 } },

  // ── ignore ───────────────────────────────────────────────────────────
  // closedlost, dead leads, etc. — return below as the default.
];

function normalizeStage(stage: string | null): string {
  if (!stage) return "";
  return stage.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function mapStage(stage: string | null): StageMapping {
  const n = normalizeStage(stage);
  if (!n) return { status: "ignore", probability: 0 };
  for (const m of MATCHERS) {
    if (m.keywords.every((k) => n.includes(k))) return m.result;
  }
  return { status: "ignore", probability: 0 };
}

// ── Loader ────────────────────────────────────────────────────────────────

export type HubSpotPledge = {
  deal_id: string;
  name: string;
  amount: number;
  stage: string | null;
  close_date: string | null;
  status: HubSpotPledgeStatus;
  probability: number;
  contact_name: string | null;
  company_name: string | null;
  last_activity_at: string | null;
};

// Pulls deals from hs_deals (joined with contacts + companies for display
// labels), applies the stage mapping, and returns only deals that map to a
// counted bucket (received / secured / projected). "ignore" stages are
// dropped — closed-lost deals shouldn't show up in fundraising progress.
//
// Filters by close_date year when provided so the Pledges page year picker
// works. If a deal has no close_date we include it by default — these are
// usually early-stage pipeline that the team hasn't committed to a year
// yet.
export async function loadHubSpotPledges(
  supabase: SupabaseClient,
  year?: number
): Promise<HubSpotPledge[]> {
  let dealsQuery = supabase
    .from("hs_deals")
    .select(
      "hubspot_id, name, amount, stage, close_date, primary_contact_id, primary_company_id, last_activity_at"
    );
  if (year !== undefined) {
    // Include deals with close_date in the target year OR no close_date.
    dealsQuery = dealsQuery.or(
      `close_date.gte.${year}-01-01,close_date.is.null`
    ).or(
      `close_date.lte.${year}-12-31,close_date.is.null`
    );
  }
  const { data: dealsRaw, error: dealsErr } = await dealsQuery;
  if (dealsErr) {
    console.error("[finance] hs_deals load failed:", dealsErr.message);
    return [];
  }
  const deals = (dealsRaw ?? []) as Array<{
    hubspot_id: string;
    name: string | null;
    amount: number | null;
    stage: string | null;
    close_date: string | null;
    primary_contact_id: string | null;
    primary_company_id: string | null;
    last_activity_at: string | null;
  }>;

  if (deals.length === 0) return [];

  // Filter to mapped-to-bucket deals first so we only fetch labels for
  // what we'll actually show.
  const enriched = deals
    .map((d) => ({ ...d, mapping: mapStage(d.stage) }))
    .filter((d) => d.mapping.status !== "ignore");
  if (enriched.length === 0) return [];

  // Year filter via close_date: PostgREST .or() chained twice above is
  // effectively (start_or_null) AND (end_or_null). For deals with a
  // close_date we additionally enforce the exact year here in JS so the
  // dropdown works precisely.
  const filtered =
    year !== undefined
      ? enriched.filter((d) => {
          if (!d.close_date) return true;
          const y = parseInt(d.close_date.slice(0, 4), 10);
          return y === year;
        })
      : enriched;
  if (filtered.length === 0) return [];

  // Pull labels for contacts + companies.
  const contactIds = Array.from(
    new Set(filtered.map((d) => d.primary_contact_id).filter((v): v is string => !!v))
  );
  const companyIds = Array.from(
    new Set(filtered.map((d) => d.primary_company_id).filter((v): v is string => !!v))
  );

  const [contactsRes, companiesRes] = await Promise.all([
    contactIds.length > 0
      ? supabase
          .from("hs_contacts")
          .select("hubspot_id, first_name, last_name, email")
          .in("hubspot_id", contactIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length > 0
      ? supabase
          .from("hs_companies")
          .select("hubspot_id, name")
          .in("hubspot_id", companyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const contactById = new Map(
    ((contactsRes.data ?? []) as Array<{
      hubspot_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>).map((c) => [
      c.hubspot_id,
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email,
    ])
  );
  const companyById = new Map(
    ((companiesRes.data ?? []) as Array<{ hubspot_id: string; name: string | null }>).map(
      (c) => [c.hubspot_id, c.name]
    )
  );

  return filtered.map((d) => ({
    deal_id: d.hubspot_id,
    name: d.name ?? "(unnamed deal)",
    amount: Number(d.amount ?? 0),
    stage: d.stage,
    close_date: d.close_date,
    status: d.mapping.status as Exclude<HubSpotPledgeStatus, "ignore">,
    probability: d.mapping.probability,
    contact_name: d.primary_contact_id ? contactById.get(d.primary_contact_id) ?? null : null,
    company_name: d.primary_company_id ? companyById.get(d.primary_company_id) ?? null : null,
    last_activity_at: d.last_activity_at,
  }));
}
