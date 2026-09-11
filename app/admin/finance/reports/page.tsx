import Link from "next/link";
import EmptyState from "@/app/admin/_components/EmptyState";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { checkExportGate } from "@/lib/admin/metrics/exportGate";
import Metric from "../../_components/Metric";
import PageHeader from "../../_components/PageHeader";
import BoardReport from "../report/BoardReport";
import ComposeForm from "./_components/ComposeForm";
import ExportControls from "./_components/ExportControls";
import { ARTIFACT_TYPE } from "@/lib/finance/reportExport";
import { TYPE } from "@/lib/admin/typeScale";

// Spec Finance, stage N3 — the Reports builder: the first surface where
// Contract 7's exit gate is a user experience. Three URL-driven states:
//
//   default        — compose a report, open the board one-pager, recent
//                    exports (documents rows, doc_type 'fin_report').
//   ?view=board    — the extracted V1 board financial report, unchanged.
//   ?draft=1&rid=… — a DRAFT: always renders (Contract 7 rule 1 — drafting
//                    is never blocked). Every number rides <Metric>, so a
//                    conflicted or stale figure is flagged INLINE at the
//                    point where it appears; the gate banner names what
//                    would block the EXIT, and only Export is gated.
//
// The draft's rid becomes the documents row id at export, so waivers
// written while drafting (export_waivers.artifact_id = rid) travel with the
// shipped artifact — decision 2, as signed. The Reed narrative slot renders
// only an APPROVED reed_drafts row (kind 'report_narrative'); nothing here
// generates or sends anything on its own.
export const dynamic = "force-dynamic";

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function parseKeys(raw: string | undefined, valid: Set<string>): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && valid.has(k))
    .slice(0, 20);
}

export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams?: { view?: string; draft?: string; rid?: string; title?: string; keys?: string };
}) {
  if (searchParams?.view === "board") return <BoardReport />;

  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Reports" subtitle="Sign in to build reports." />
      </div>
    );
  }
  const supabase = createServerSupabase();
  const catalog = await getMetricCatalog();
  const validKeys = new Set(catalog.map((m) => m.metric_key));

  // ── Draft mode ──────────────────────────────────────────────────────────
  if (searchParams?.draft === "1" && isUuid(searchParams.rid)) {
    const rid = searchParams.rid;
    const title = (searchParams.title ?? "").trim().slice(0, 120) || "Financial report";
    const keys = parseKeys(searchParams.keys, validKeys);
    const gate = await checkExportGate(ARTIFACT_TYPE, rid, keys);

    // The narrative slot: the latest APPROVED Reed draft only. Honest empty
    // state otherwise — never generated here, never auto-included.
    const { data: narrativeRow } = await supabase
      .from("reed_drafts")
      .select("body, updated_at")
      .eq("org_id", ctx.orgId)
      .eq("kind", "report_narrative")
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const narrative = (narrativeRow?.body as string | null) ?? null;

    return (
      <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <PageHeader
          eyebrow={
            <Link href="/admin/finance/reports" className="hover:text-ink-1 transition-colors">
              ← Reports
            </Link>
          }
          title={title}
          subtitle={`Draft · ${keys.length} metric${keys.length === 1 ? "" : "s"} · ${ctx.orgName}`}
        />

        <ExportControls rid={rid} title={title} keys={keys} gate={{
          blocked: gate.blocked,
          blockers: gate.blockers,
          waived: gate.waived,
          unconfirmed: gate.unconfirmed,
        }} />

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className={TYPE.cardTitle}>The numbers</h2>
          </div>
          {keys.length === 0 ? (
            <p className={`p-6 ${TYPE.bodyMuted}`}>No metrics selected. Go back and pick some.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {keys.map((key) => (
                <li key={key} className="px-5 py-3">
                  <Metric metricKey={key} showName />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className={TYPE.cardTitle}>Narrative</h2>
          </div>
          {narrative ? (
            <p className="p-5 text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">{narrative}</p>
          ) : (
            <p className={`p-6 ${TYPE.bodyMuted}`}>
              No approved narrative. Reed can draft one (kind &ldquo;report narrative&rdquo;). 
              it renders here only after a human approves it, and never sends itself.
            </p>
          )}
        </section>
      </div>
    );
  }

  // ── Default: compose + board report + recent exports ────────────────────
  const { data: recentRows } = await supabase
    .from("documents")
    .select("id, title, filename, created_at")
    .eq("org_id", ctx.orgId)
    .eq("doc_type", ARTIFACT_TYPE)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);
  const recent = (recentRows ?? []) as Array<{
    id: string; title: string | null; filename: string; created_at: string;
  }>;

  return (
    <div className="max-w-4xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Draft always; flag unresolved figures inline; block only the exit (Contract 7)."
        actions={
          <Link
            href="/admin/finance/reports?view=board"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 bg-tile hover:bg-[#EFE6D4] border-[1.5px] border-outline px-4 py-2 rounded-full transition-colors"
          >
            Board financial report →
          </Link>
        }
      />

      <ComposeForm
        metrics={catalog
          .filter((m) => m.active)
          .map((m) => ({
            key: m.metric_key,
            name: m.name,
            state: m.confirmed_state,
            stale: m.stale,
          }))}
      />

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-outline">
          <h2 className={TYPE.cardTitle}>
            Recent exports <span className="text-ink-3 font-normal">· {recent.length}</span>
          </h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-4">
            <EmptyState
              label="exports"
              title="Nothing exported yet"
              hint={`Compose a report above and export it; each export lands in the file cabinet (documents, type “fin_report”) with its waivers on the record.`}
            />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {recent.map((d) => (
              <li key={d.id} className="px-5 py-3 flex items-center gap-3">
                <a
                  href={`/api/admin/documents/${d.id}/url`}
                  className="text-sm font-medium text-ink-1 hover:text-orange transition-colors truncate"
                >
                  {d.title || d.filename}
                </a>
                <span className="ml-auto text-xs text-ink-3 [font-variant-numeric:tabular-nums]">
                  {d.created_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
