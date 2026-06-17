import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import PageHeader from "../../_components/PageHeader";
import ProspectsTable, { type ProspectRow } from "./_components/ProspectsTable";

// Prospects list (design-system §4.4) — a view over the HubSpot mirror
// (read-only staging) joined to internal scores. Reads run under the user
// session (RLS). Filtering, search, sort, pagination, column picker, CSV,
// bulk actions, and saved views all live in the shared DataTable, client-side;
// the server just loads the dataset once.
export const dynamic = "force-dynamic";

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

const SELECT_COLS =
  "hubspot_id, email, first_name, last_name, company, lifecycle_stage, owner_id, last_activity_at";

// Page through a table fully — Supabase caps a single response at 1000 rows,
// and the client table needs the whole set to filter/sort/paginate accurately.
async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  maxPages = 20
): Promise<{ rows: T[]; error: boolean }> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) {
      console.error(`[/admin/fundraising/prospects] ${table} query failed:`, {
        code: error.code,
        message: error.message,
      });
      return { rows: out, error: true };
    }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return { rows: out, error: false };
}

export default async function FundraisingProspectsPage({
  searchParams,
}: {
  searchParams?: { show?: string };
}) {
  const supabase = createServerSupabase();

  const [{ rows: contacts, error: contactsErr }, { rows: scores }, { rows: disqualified }] = await Promise.all([
    fetchAll<ContactSlim>(supabase, "hs_contacts", SELECT_COLS),
    fetchAll<{ hubspot_contact_id: string; score_total: number | null }>(
      supabase,
      "fr_prospect_scores",
      "hubspot_contact_id, score_total"
    ),
    fetchAll<{ hubspot_id: string }>(supabase, "fr_prospect_disqualified", "hubspot_id"),
  ]);

  const scoreMap = new Map(scores.map((s) => [s.hubspot_contact_id, s.score_total]));
  const disqualifiedSet = new Set(disqualified.map((d) => d.hubspot_id));
  const disqualifiedView = searchParams?.show === "disqualified";

  const allRows: ProspectRow[] = contacts.map((c) => ({
    ...c,
    score_total: scoreMap.get(c.hubspot_id) ?? null,
  }));
  // Disqualified prospects drop off the working list (reversible); the
  // ?show=disqualified view lists only those, for requalifying.
  const rows = allRows.filter((r) =>
    disqualifiedView ? disqualifiedSet.has(r.hubspot_id) : !disqualifiedSet.has(r.hubspot_id)
  );

  const lifecycleOptions = Array.from(
    new Set(contacts.map((c) => c.lifecycle_stage).filter((v): v is string => !!v))
  ).sort();
  const ownerOptions = Array.from(
    new Set(contacts.map((c) => c.owner_id).filter((v): v is string => !!v))
  ).sort();

  const scoredCount = rows.filter((r) => r.score_total !== null).length;

  return (
    <div className="max-w-[1400px] px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title={disqualifiedView ? "Prospects · Disqualified" : "Prospects"}
        subtitle={
          `${rows.length} contact${rows.length === 1 ? "" : "s"}` +
          (disqualifiedView ? " disqualified" : " from the HubSpot mirror") +
          (!disqualifiedView && scoredCount > 0 ? ` · ${scoredCount} scored` : "")
        }
        actions={
          disqualifiedView ? (
            <Link
              href="/admin/fundraising/prospects"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              ← Active prospects
            </Link>
          ) : disqualifiedSet.size > 0 ? (
            <Link
              href="/admin/fundraising/prospects?show=disqualified"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
            >
              Disqualified ({disqualifiedSet.size})
            </Link>
          ) : undefined
        }
      />

      {contactsErr && (
        <div className="mb-4 bg-expense-bg border border-expense/30 rounded-xl px-5 py-3 text-expense text-sm">
          Some prospect records failed to load — the list below may be incomplete. Reload to retry.
        </div>
      )}

      <ProspectsTable
        rows={rows}
        lifecycleOptions={lifecycleOptions}
        ownerOptions={ownerOptions}
        disqualifiedView={disqualifiedView}
      />
    </div>
  );
}
