import PageHeader from "../_components/PageHeader";
import SectionHeading from "../_components/SectionHeading";
import ImportWizard, { type EntityType } from "./_components/ImportWizard";
import UndoImportButton from "./_components/UndoImportButton";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ctxHasPermission } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getProgramTerms } from "@/lib/admin/terminology";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

// The one import wizard (spec #5 E3; V4 Stage F): upload → map → preview →
// commit, with Undo. Participants, donors, and donors with gifts (the older
// /admin/fundraising/import wizard is retired into this one). Seated at
// /admin/settings/imports/csv; not in the main nav.
export const dynamic = "force-dynamic";

type ImportRun = {
  id: string;
  filename: string | null;
  entity_type: string;
  source: string;
  status: string;
  counts: {
    total?: number; created?: number; skipped?: number; invalid?: number; donors_created?: number;
    // Connector runs (source 'hubspot') carry per-step counts instead.
    contacts?: number; companies?: number; deals?: number; engagements?: number; errors?: number;
    undo?: { removed: { gifts: number; donors: number; participants: number } };
  };
  created_at: string;
};

const KIND: Record<string, string> = { student: "Participants", constituent: "Donors", gift: "Donors and gifts" };

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
  if (r.status === "undone" && r.counts.undo) {
    const u = r.counts.undo.removed;
    return `Undone: removed ${u.gifts + u.donors + u.participants} records`;
  }
  if (r.status === "done") {
    const extra = r.entity_type === "gift" ? ` · ${r.counts.donors_created ?? 0} new donors` : "";
    return `${r.counts.created ?? 0} created${extra} · ${r.counts.skipped ?? 0} skipped · ${r.counts.invalid ?? 0} need fixing`;
  }
  return `${r.counts.total ?? 0} rows`;
}

const STATUS_CHIP: Record<string, string> = {
  done: "bg-revenue-bg text-revenue",
  failed: "bg-expense-bg text-expense",
  committing: "bg-orange/15 text-orange",
  undone: "bg-tile text-ink-2",
};

export default async function ImportsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission(["program.read", "fundraising.read"], "Imports");
  if (!roleGate.ok) return roleGate.page;
  const ctx = roleGate.ctx;
  const [terms, ents, canProgram, canFundraising] = await Promise.all([
    getProgramTerms(),
    getEntitlements(ctx.orgId),
    ctxHasPermission(ctx, "program.write"),
    ctxHasPermission(ctx, "fundraising.write"),
  ]);
  // The targets this person may import: their role's write permission AND the module.
  const entities: EntityType[] = [
    ...(canFundraising && hasFeature(ents, "modules.fundraising") ? (["gift", "constituent"] as const) : []),
    ...(canProgram && hasFeature(ents, "modules.program") ? (["student"] as const) : []),
  ];
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("imports")
    .select("id, filename, entity_type, source, status, counts, created_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(20);
  const runs = (data ?? []) as ImportRun[];
  // Only file imports resume through the wizard — a connector run (E6) is
  // driven by its own sync engine.
  const resumable = runs.find((r) => r.status === "committing" && r.source === "csv");
  // V4 Stage E: open cohorts for "put everyone in this cohort" (org-pinned).
  const { data: cohortRows } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("org_id", ctx.orgId)
    .in("status", ["planning", "active"])
    .order("name");
  const cohortParam = searchParams?.cohort;
  const initialCohortId = typeof cohortParam === "string" ? cohortParam : null;
  const targetParam = searchParams?.target;
  const initialEntity = targetParam === "gift" || targetParam === "constituent" || targetParam === "student" ? targetParam : null;
  const canUndo = (r: ImportRun) =>
    r.source === "csv" && r.status === "done" && (r.entity_type === "student" ? canProgram : canFundraising);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading">
      <PageHeader
        title="Import"
        subtitle={`Bring donors, gifts or ${terms.students.toLowerCase()} in from a spreadsheet. Match columns, preview, import, and undo if something looks wrong.`}
      />

      {entities.length === 0 ? (
        <p className="rounded-panel border border-hairline bg-surface px-5 py-4 text-sm text-ink-2">
          Your role can see past imports but not start one. Ask an owner or admin.
        </p>
      ) : (
        <ImportWizard
          resumeId={resumable?.id ?? null}
          cohorts={(cohortRows ?? []) as { id: string; name: string }[]}
          initialCohortId={initialCohortId}
          initialEntity={initialEntity}
          entities={entities}
        />
      )}

      {runs.length > 0 && (
        <section className="mt-8">
          <SectionHeading className="mb-2">Past imports</SectionHeading>
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id}
                className="bg-surface border border-hairline rounded-panel px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-ink-1 font-semibold">
                  {r.source === "hubspot" ? "HubSpot sync" : r.filename ?? "Untitled file"}
                </span>
                <span className="text-xs text-ink-2">
                  {r.source === "hubspot" ? "Connector" : KIND[r.entity_type] ?? r.entity_type}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status] ?? "bg-tile text-ink-2"}`}>
                  {r.status === "committing" && r.source === "hubspot" ? "syncing" : r.status}
                </span>
                <span className="text-ink-2 tabular-nums ml-auto">{countsLine(r)}</span>
                <span className="text-ink-2 tabular-nums">{r.created_at.slice(0, 10)}</span>
                {canUndo(r) ? <UndoImportButton id={r.id} label={r.filename ?? "this import"} /> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
