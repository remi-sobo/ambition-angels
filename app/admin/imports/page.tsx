import PageHeader from "../_components/PageHeader";
import SectionHeading from "../_components/SectionHeading";
import ImportWizard from "./_components/ImportWizard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getProgramTerms } from "@/lib/admin/terminology";

// Staged CSV import (spec #5 E3): upload → map → preview → commit. One door
// for getting existing data into BloomOS — participants now, constituents in
// E4. Linked from the Students page; not in the main nav.
export const dynamic = "force-dynamic";

type ImportRun = {
  id: string;
  filename: string | null;
  entity_type: string;
  source: string;
  status: string;
  counts: {
    total?: number; created?: number; skipped?: number; invalid?: number;
    // Connector runs (source 'hubspot') carry per-step counts instead.
    contacts?: number; companies?: number; deals?: number; engagements?: number; errors?: number;
  };
  created_at: string;
};

function countsLine(r: ImportRun): string {
  if (r.source === "hubspot") {
    const parts = [
      `${r.counts.contacts ?? 0} contacts`,
      `${r.counts.companies ?? 0} companies`,
      `${r.counts.deals ?? 0} deals`,
      `${r.counts.engagements ?? 0} engagements`,
    ];
    if (r.counts.errors) parts.push(`${r.counts.errors} errors`);
    return parts.join(" · ");
  }
  return r.status === "done"
    ? `${r.counts.created ?? 0} created · ${r.counts.skipped ?? 0} skipped · ${r.counts.invalid ?? 0} invalid`
    : `${r.counts.total ?? 0} rows`;
}

const STATUS_CHIP: Record<string, string> = {
  done: "bg-revenue-bg text-revenue",
  failed: "bg-expense-bg text-expense",
  committing: "bg-orange/15 text-orange",
};

export default async function ImportsPage() {
  const ctx = await getOrgContext();
  const terms = await getProgramTerms();
  const supabase = getSupabaseAdmin();
  const { data } = ctx
    ? await supabase
        .from("imports")
        .select("id, filename, entity_type, source, status, counts, created_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };
  const runs = (data ?? []) as ImportRun[];
  // Only file imports resume through the wizard — a connector run (E6) is
  // driven by its own sync engine.
  const resumable = runs.find((r) => r.status === "committing" && r.source === "csv");

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[860px]">
      <PageHeader
        title="Import"
        subtitle={`Bring existing ${terms.students.toLowerCase()} or donors in from a CSV — map columns to your fields, preview, then commit`}
      />

      <ImportWizard resumeId={resumable?.id ?? null} />

      {runs.length > 0 && (
        <section className="mt-8">
          <SectionHeading className="mb-2">Past imports</SectionHeading>
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id}
                className="bg-surface border-[1.5px] border-outline rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="text-ink-1 font-semibold">
                  {r.source === "hubspot" ? "HubSpot sync" : r.filename ?? "Untitled file"}
                </span>
                <span className="text-[10px] text-ink-3 uppercase tracking-wider">
                  {r.source === "hubspot" ? "Connector" : r.entity_type === "constituent" ? "Donors" : "Participants"}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${STATUS_CHIP[r.status] ?? "bg-tile text-ink-2"}`}>
                  {r.status === "committing" && r.source === "hubspot" ? "syncing" : r.status}
                </span>
                <span className="text-ink-2 tabular-nums ml-auto">{countsLine(r)}</span>
                <span className="text-ink-3 tabular-nums">{r.created_at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
