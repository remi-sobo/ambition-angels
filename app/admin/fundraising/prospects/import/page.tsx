import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../../../_components/PageHeader";
import HubspotImportPicker from "./_components/HubspotImportPicker";

// Phase 2 — deliberately pull more HubSpot contacts onto the bench, beyond the
// rule-D seed. Surfaces mirror contacts not yet benched; search + lifecycle
// filter (filter out 'customer' to skip existing donors); bulk add.
export const dynamic = "force-dynamic";

export default async function ImportFromHubspotPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: lc }, { data: count }] = await Promise.all([
    supabase.from("hs_contacts").select("lifecycle_stage"),
    supabase.rpc("hubspot_bench_candidates_count", { p_search: null, p_lifecycle: null }),
  ]);
  const lifecycles = Array.from(
    new Set((lc ?? []).map((r) => r.lifecycle_stage as string | null).filter((v): v is string => !!v))
  ).sort();
  const total = Number(count ?? 0);

  return (
    <div className="max-w-[1200px] px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Import from HubSpot"
        subtitle={`${total.toLocaleString()} HubSpot contact${total === 1 ? "" : "s"} not yet on the bench`}
        actions={
          <Link
            href="/admin/fundraising/prospects"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
          >
            ← Bench
          </Link>
        }
      />
      <p className="mb-4 text-sm text-ink-2 max-w-2xl">
        Pick HubSpot contacts to add to the bench. Tip: filter by lifecycle stage and
        skip <span className="font-medium">customer</span> (existing donors) — the bench is for
        prospects you haven&apos;t closed yet. Added contacts land active and can be rated,
        researched, and put on angles like any other prospect.
      </p>
      <HubspotImportPicker lifecycles={lifecycles} />
    </div>
  );
}
