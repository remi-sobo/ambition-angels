import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveEntities } from "@/lib/admin/entities";
import { getDisplayNames } from "@/lib/admin/profile";
import { DOC_TYPES, DOC_TYPE_LABEL, EXPIRING_WINDOW_DAYS } from "@/lib/documents/config";
import PageHeader from "../_components/PageHeader";
import EntityChip from "../_components/EntityChip";
import DataTable, { type DataTableColumn } from "../_components/ui/DataTable";
import SavedViews from "../_components/ui/SavedViews";
import Figure, { SummaryStrip } from "../_components/ui/Figure";
import Badge from "../_components/ui/Badge";
import { PageSection } from "../_components/ui/PageShell";
import DocumentActions from "./_components/DocumentActions";
import DocumentFilterRow from "./_components/DocumentFilterRow";
import UploadDocumentButton from "./_components/UploadDocumentButton";
import { applyTableSort, parseTableState, rowRange } from "@/lib/admin/dataTable";
import { DOCUMENT_TABLE, documentNextStep, documentFilterParams } from "@/lib/documents/hubList";

export const dynamic = "force-dynamic";

const BASE = "/admin/work/documents";

// /admin/documents — the org-wide document hub (spec #2, Phase 3). Every
// query runs through the SESSION client, so RLS scopes the list to the
// caller's org and permission set. ask_documents rows are surfaced read-only
// alongside native documents (open decision A) so fundraisers see one list;
// consolidation is a tracked follow-on.
//
// V4 Stage G: the List archetype. Upload is the one primary action (kit
// Drawer); All / Expiring soon are saved views; one filter row; a sourced
// summary strip; DataTable v2 with URL sort and paging, a next-step column
// (renewals) and a row menu (open, edit, archive, delete).

type DocRow = {
  id: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  title: string | null;
  doc_type: string | null;
  notes: string | null;
  status: string;
  visibility: string;
  issued_at: string | null;
  expires_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  document_links: { entity_type: string; entity_id: string }[];
};

type AskDocRow = {
  id: string;
  ask_id: string;
  filename: string;
  label: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const fmtSize = (n: number | null) => {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

export default async function DocumentsHubPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const ctx = await getOrgContext();
  if (!ctx) return null; // middleware gates /admin/*; belt-and-suspenders
  const supabase = createServerSupabase();
  const raw = searchParams ?? {};
  const one = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const view = one("view") === "expiring" ? "expiring" : "all";
  const statusRaw = one("status") ?? "active";
  const status = statusRaw === "archived" || statusRaw === "all" ? statusRaw : "active";
  const type = one("type") ?? "all";
  const owner = one("owner") ?? "all";
  const q = (one("q") ?? "").trim().slice(0, 120);
  const state = parseTableState(raw, DOCUMENT_TABLE);
  const cutoff = new Date(Date.now() + EXPIRING_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  let query = supabase
    .from("documents")
    .select(
      "id, filename, mime, size_bytes, title, doc_type, notes, status, visibility, issued_at, expires_at, uploaded_by, created_at, document_links(entity_type, entity_id)",
      { count: "exact" },
    )
    .eq("org_id", ctx.orgId);
  if (status === "active" || status === "archived") query = query.eq("status", status);
  else query = query.neq("status", "superseded");
  if (type !== "all") query = query.eq("doc_type", type);
  if (/^[0-9a-f-]{36}$/i.test(owner)) query = query.eq("uploaded_by", owner);
  if (q) {
    const like = `%${q.replaceAll("%", "").replaceAll(",", " ")}%`;
    query = query.or(`title.ilike.${like},filename.ilike.${like}`);
  }
  if (view === "expiring") query = query.not("expires_at", "is", null).lte("expires_at", cutoff);
  query = applyTableSort(query, state.sort, { created_at: "created_at", title: "title", expires_at: "expires_at" });
  const { from, to } = rowRange(state.page, DOCUMENT_TABLE.pageSize);

  const [docsRes, { data: askDocsData }, activeRes, expiringRes, { count: orgDocCount }] = await Promise.all([
    query.range(from, to),
    supabase
      .from("ask_documents")
      .select("id, ask_id, filename, label, size_bytes, uploaded_by, created_at")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("org_id", ctx.orgId).eq("status", "active"),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lte("expires_at", cutoff),
    // Any document at all, any status — the first-run signal (a
    // filtered-to-zero view is not a first run).
    supabase.from("documents").select("*", { count: "exact", head: true }).eq("org_id", ctx.orgId),
  ]);
  const totalDocs = orgDocCount ?? 0;
  const docs = (docsRes.data ?? []) as unknown as DocRow[];
  const askDocs = (askDocsData ?? []) as AskDocRow[];

  // Resolve every linked entity in one batched pass, then hand chips out per row.
  const allLinks = docs.flatMap((d) => d.document_links ?? []);
  const resolved = await resolveEntities(allLinks.map((l) => ({ type: l.entity_type, id: l.entity_id })));
  const chipByKey = new Map(allLinks.map((l, i) => [`${l.entity_type}:${l.entity_id}`, resolved[i]]));
  const ownerIds = Array.from(new Set(docs.map((d) => d.uploaded_by).filter(Boolean))) as string[];
  const names = await getDisplayNames(ownerIds);

  const today = todayISO();
  const typeOptions = [{ value: "all", label: "Any type" }].concat(DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] })));
  const filters = documentFilterParams({ view, status, type, owner, q });
  const viewHref = (v: string) => {
    const p = new URLSearchParams(documentFilterParams({ view: v, status, type, owner, q }));
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const countOf = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const firstRun = totalDocs === 0 && !docsRes.error;

  const columns: DataTableColumn<DocRow>[] = [
    {
      key: "title",
      header: "Document",
      card: "title",
      render: (d) => (
        <>
          <a
            href={`/api/admin/documents/${d.id}/url`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink-1 hover:text-orange transition-colors break-words"
          >
            {d.title || d.filename}
          </a>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {d.doc_type ? <span className="text-xs text-ink-2">{DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</span> : null}
            {d.visibility === "restricted" ? <Badge tone="danger">Restricted</Badge> : null}
            {(d.document_links ?? []).map((l) => {
              const chip = chipByKey.get(`${l.entity_type}:${l.entity_id}`);
              return chip ? <EntityChip key={`${l.entity_type}:${l.entity_id}`} entity={chip} className="max-w-[14rem]" /> : null;
            })}
          </span>
          {d.notes ? (
            <span className="block mt-0.5 text-xs text-ink-2 truncate max-w-[420px]" title={d.notes}>
              {d.notes}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "expires_at",
      header: "Expires",
      className: "tabular-nums text-ink-2",
      render: (d) =>
        d.expires_at ? (
          <span className={d.expires_at < today ? "text-status-critical-text font-semibold" : ""}>{d.expires_at}</span>
        ) : (
          <span className="text-ink-3">No expiry</span>
        ),
    },
    {
      key: "owner",
      header: "Uploaded by",
      className: "text-ink-2",
      render: (d) => (d.uploaded_by ? names[d.uploaded_by] ?? "Unknown" : <span className="text-ink-3">Unknown</span>),
    },
    { key: "size", header: "Size", align: "right", className: "tabular-nums text-ink-2", render: (d) => fmtSize(d.size_bytes) },
    { key: "created_at", header: "Added", className: "tabular-nums text-ink-2", render: (d) => fmtDate(d.created_at) },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      card: "field",
      render: (d) => (
        <DocumentActions
          doc={{
            id: d.id,
            filename: d.filename,
            title: d.title,
            doc_type: d.doc_type,
            notes: d.notes,
            issued_at: d.issued_at,
            expires_at: d.expires_at,
            visibility: d.visibility,
          }}
          status={d.status}
        />
      ),
    },
  ];

  const askColumns: DataTableColumn<AskDocRow>[] = [
    {
      key: "file",
      header: "File",
      card: "title",
      render: (a) => (
        <a href={`/api/admin/asks/${a.ask_id}/documents/${a.id}`} target="_blank" rel="noreferrer" className="font-semibold text-ink-1 hover:text-orange">
          {a.label || a.filename}
        </a>
      ),
    },
    { key: "size", header: "Size", align: "right", className: "tabular-nums text-ink-2", render: (a) => fmtSize(a.size_bytes) },
    { key: "added", header: "Added", className: "tabular-nums text-ink-2", render: (a) => fmtDate(a.created_at) },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-workspace">
      <PageHeader
        title="Documents"
        subtitle="Every file in the organization, attached to the records it belongs to"
        primaryAction={<UploadDocumentButton />}
        moreActions={[
          { label: "Expiring soon", href: viewHref("expiring") },
          { label: "Archived documents", href: `${BASE}?status=archived` },
          { label: "Compliance", href: "/admin/organization/compliance" },
        ]}
      />

      {firstRun ? (
        <EmptyState
          label="documents"
          title="No documents yet"
          purpose="Award letters, MOUs, board packets, policies: every file attached to the record it belongs to."
          primaryAction={<UploadDocumentButton />}
          next="Files with an expiration date show up in Expiring soon and the renewal queue."
        />
      ) : (
        <>
          <SavedViews
            label="Document views"
            activeKey={view}
            views={[
              { key: "all", label: "All", href: viewHref("all") },
              { key: "expiring", label: "Expiring soon", href: viewHref("expiring"), count: countOf(expiringRes) ?? undefined },
            ]}
          />
          <DocumentFilterRow view={view} status={status} type={type} owner={owner} q={q} typeOptions={typeOptions} />
          <div className="mt-3" />
          <SummaryStrip label="Documents summary">
            <Figure label="Active documents" value={countOf(activeRes)} source="Status active, as of now" />
            <Figure
              label={`Expiring within ${EXPIRING_WINDOW_DAYS} days`}
              value={countOf(expiringRes)}
              source="Active, with an expiration date on or before the window"
              href={(countOf(expiringRes) ?? 0) > 0 ? viewHref("expiring") : undefined}
            />
            <Figure label="Ask files (fundraising)" value={askDocs.length} source="Read-only here; managed on their asks" />
          </SummaryStrip>
          <DataTable
            label="Documents"
            noun={{ one: "document", many: "documents" }}
            columns={columns}
            nextStep={{
              header: "Next step",
              sortKey: "expires_at",
              render: (d) => {
                const n = documentNextStep(d, today);
                return (
                  <span className={n.tone === "late" ? "text-status-critical-text font-semibold" : n.tone === "due" ? "text-ink-1" : "text-ink-2"}>
                    {n.text}
                  </span>
                );
              },
            }}
            data={{
              rows: docs,
              total: docsRes.count ?? 0,
              page: state.page,
              pageSize: DOCUMENT_TABLE.pageSize,
              error: docsRes.error ? "The documents could not be read." : null,
            }}
            getRowId={(d) => d.id}
            getRowLabel={(d) => d.title || d.filename}
            spec={DOCUMENT_TABLE}
            state={state}
            baseHref={BASE}
            filters={filters}
            emptyMessage={view === "expiring" ? "Nothing expires in the window. All current." : "No documents match these filters."}
          />
        </>
      )}

      {askDocs.length > 0 && (
        <PageSection title="Ask files (fundraising)">
          <p className="text-xs text-ink-2 -mt-2 mb-3">
            Managed on their asks. Shown here so the organization&apos;s files read as one list.
          </p>
          <DataTable
            label="Ask files"
            noun={{ one: "file", many: "files" }}
            columns={askColumns}
            nextStep={{
              header: "Next step",
              render: (a) => (
                <Link href={`/admin/fundraising/asks/${a.ask_id}`} className="font-semibold text-orange hover:text-orange-dark">
                  View the ask
                </Link>
              ),
            }}
            data={{ rows: askDocs, total: askDocs.length, page: 0, pageSize: 100 }}
            getRowId={(a) => a.id}
            getRowLabel={(a) => a.label || a.filename}
            spec={{ sortable: [], defaultSort: null, pageSize: 100 }}
            state={{ page: 0, sort: null }}
            baseHref={BASE}
            filters={filters}
          />
        </PageSection>
      )}
    </div>
  );
}
