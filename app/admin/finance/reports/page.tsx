import EmptyState from "@/app/admin/_components/EmptyState";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { checkExportGate } from "@/lib/admin/metrics/exportGate";
import Metric from "../../_components/Metric";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import Button from "../../_components/ui/Button";
import DataTable from "../../_components/ui/DataTable";
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
      <PageShell width="reading">
        <PageHeader title="Reports" subtitle="Sign in to build reports." />
      </PageShell>
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
      <PageShell width="reading" className="space-y-6">
        <PageHeader
          breadcrumb={[{ label: "Reports", href: "/admin/finance/reports" }]}
          title={title}
          subtitle={`Draft · ${keys.length} metric${keys.length === 1 ? "" : "s"} · ${ctx.orgName}`}
        />

        <ExportControls rid={rid} title={title} keys={keys} gate={{
          blocked: gate.blocked,
          blockers: gate.blockers,
          waived: gate.waived,
          unconfirmed: gate.unconfirmed,
        }} />

        <section className="bg-surface border border-hairline rounded-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline">
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

        <section className="bg-surface border border-hairline rounded-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline">
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
      </PageShell>
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

  // Form archetype at reading width (V4 Stage G2): one primary action (the
  // board report), compose, recent exports on DataTable v2.
  type Recent = (typeof recent)[number];
  return (
    <PageShell width="reading" className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Draft any time. Unresolved figures are flagged where they appear, and only the export is held back."
        primaryAction={<Button href="/admin/finance/reports?view=board">Board financial report</Button>}
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

      <section>
        <h2 className={`${TYPE.cardTitle} mb-2`}>Recent exports</h2>
        <DataTable<Recent>
          label="Recent exports"
          noun={{ one: "export", many: "exports" }}
          columns={[
            {
              key: "title",
              header: "Report",
              card: "title",
              render: (d) => (
                <a href={`/api/admin/documents/${d.id}/url`} className="font-semibold text-ink-1 hover:underline underline-offset-2">
                  {d.title || d.filename}
                </a>
              ),
            },
            { key: "date", header: "Exported", className: "text-ink-2 tabular-nums", render: (d) => d.created_at.slice(0, 10) },
          ]}
          data={{ rows: recent, total: recent.length, page: 0, pageSize: 20 }}
          getRowId={(d) => d.id}
          getRowLabel={(d) => d.title || d.filename}
          spec={{ sortable: [], defaultSort: null, pageSize: 20 }}
          state={{ page: 0, sort: null }}
          baseHref="/admin/finance/reports"
          empty={
            <div className="p-4">
              <EmptyState
                label="exports"
                title="Nothing exported yet"
                hint="Compose a report above and export it. Each export lands in Documents with its waivers on the record."
              />
            </div>
          }
        />
      </section>
    </PageShell>
  );
}
