import { createServerSupabase } from "@/lib/supabase/server";
import PageHeader from "../../_components/PageHeader";
import ProspectFilters from "../_components/ProspectFilters";
import ProspectsTable, { type ProspectRow } from "../_components/ProspectsTable";

// ── searchParams parsing ───────────────────────────────────────────────────

type SearchParams = {
  q?: string;
  lifecycle?: string;
  owner?: string;
  scored?: string;
};

function parseSearchParams(sp: SearchParams) {
  return {
    q: (sp.q ?? "").trim(),
    lifecycle: (sp.lifecycle ?? "").trim(),
    owner: (sp.owner ?? "").trim(),
    scored: sp.scored === "1",
  };
}

// ── Types from Supabase ────────────────────────────────────────────────────

type ContactSlim = {
  hubspot_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  last_activity_at: string | null;
};

type ScoreSlim = {
  hubspot_contact_id: string;
  score_total: number | null;
};

const SELECT_COLS =
  "hubspot_id, email, first_name, last_name, company, lifecycle_stage, owner_id, last_activity_at";

// Strip chars that break Supabase's .or() filter parser (commas,
// parens, asterisk) or that would inject wildcards (%).
function sanitizeSearch(s: string): string {
  return s.replace(/[,()*%]/g, "").trim();
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function FundraisingProspectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, lifecycle, owner, scored } = parseSearchParams(searchParams);
  const supabase = createServerSupabase();

  // Query 1: contacts narrowed by server-side filters.
  let contactsQuery = supabase.from("hs_contacts").select(SELECT_COLS);
  const safeSearch = sanitizeSearch(q);
  if (safeSearch.length > 0) {
    const pattern = `%${safeSearch}%`;
    contactsQuery = contactsQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
    );
  }
  if (lifecycle) contactsQuery = contactsQuery.eq("lifecycle_stage", lifecycle);
  if (owner) contactsQuery = contactsQuery.eq("owner_id", owner);

  const { data: contactsRaw, error: contactsErr } = await contactsQuery;
  if (contactsErr) {
    console.error("[/admin/fundraising/prospects] contacts query failed:", {
      code: contactsErr.code,
      message: contactsErr.message,
    });
  }
  const contacts: ContactSlim[] = (contactsRaw as ContactSlim[] | null) ?? [];

  // Query 2: matching scores via IN(). Two-query merge instead of a join
  // because there's no FK between hs_contacts.hubspot_id and
  // fr_prospect_scores.hubspot_contact_id (a prospect can be scored before
  // the next sync runs).
  let scoreMap = new Map<string, number | null>();
  if (contacts.length > 0) {
    const ids = contacts.map((c) => c.hubspot_id);
    const { data: scoresRaw, error: scoresErr } = await supabase
      .from("fr_prospect_scores")
      .select("hubspot_contact_id, score_total")
      .in("hubspot_contact_id", ids);
    if (scoresErr) {
      console.error("[/admin/fundraising/prospects] scores query failed:", {
        code: scoresErr.code,
        message: scoresErr.message,
      });
    }
    const scores: ScoreSlim[] = (scoresRaw as ScoreSlim[] | null) ?? [];
    scoreMap = new Map(scores.map((s) => [s.hubspot_contact_id, s.score_total]));
  }

  let rows: ProspectRow[] = contacts.map((c) => ({
    ...c,
    score_total: scoreMap.get(c.hubspot_id) ?? null,
  }));
  if (scored) rows = rows.filter((m) => m.score_total !== null);

  // Distinct dropdown values pulled from the full dataset (not from the
  // current filter result) so dropdowns don't artificially narrow.
  const { data: distinctRaw } = await supabase
    .from("hs_contacts")
    .select("lifecycle_stage, owner_id");
  const distinct = (distinctRaw ?? []) as Array<
    Pick<ContactSlim, "lifecycle_stage" | "owner_id">
  >;
  const lifecycleOptions = Array.from(
    new Set(distinct.map((r) => r.lifecycle_stage).filter((v): v is string => !!v))
  ).sort();
  const ownerOptions = Array.from(
    new Set(distinct.map((r) => r.owner_id).filter((v): v is string => !!v))
  ).sort();

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1400px] space-y-5">
      <PageHeader
        title="Prospects"
        subtitle={`${rows.length} ${rows.length === 1 ? "prospect" : "prospects"} matching`}
      />

      <ProspectFilters
        q={q}
        lifecycle={lifecycle}
        owner={owner}
        scored={scored}
        lifecycleOptions={lifecycleOptions}
        ownerOptions={ownerOptions}
      />

      <ProspectsTable rows={rows} />
    </div>
  );
}
