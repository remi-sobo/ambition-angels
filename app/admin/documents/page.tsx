import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { resolveEntities } from "@/lib/admin/entities";
import { getDisplayNames } from "@/lib/admin/profile";
import { DOC_TYPES, DOC_TYPE_LABEL, EXPIRING_WINDOW_DAYS } from "@/lib/documents/config";
import PageHeader from "../_components/PageHeader";
import StatCard from "../_components/StatCard";
import FilterTabs from "../fundraising/_components/FilterTabs";
import EntityChip from "../_components/EntityChip";
import DocumentActions from "./_components/DocumentActions";
import UploadDocumentButton from "./_components/UploadDocumentButton";
import { TYPE } from "@/lib/admin/typeScale";

export const dynamic = "force-dynamic";

// /admin/documents — the org-wide document hub (spec #2, Phase 3). Every
// query runs through the SESSION client, so RLS scopes the list to the
// caller's org and permission set. ask_documents rows are surfaced read-only
// alongside native documents (open decision A) so fundraisers see one list;
// consolidation is a tracked follow-on.

type DocRow = {
  id: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  title: string | null;
  doc_type: string | null;
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
  searchParams?: { view?: string; status?: string; type?: string; owner?: string; q?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) return null; // middleware gates /admin/*; belt-and-suspenders
  const supabase = createServerSupabase();

  const view = searchParams?.view === "expiring" ? "expiring" : "all";
  const status = searchParams?.status ?? "active";
  const type = searchParams?.type ?? "all";
  const owner = searchParams?.owner ?? "all";
  const q = (searchParams?.q ?? "").trim();

  let query = supabase
    .from("documents")
    .select(
      "id, filename, mime, size_bytes, title, doc_type, status, visibility, issued_at, expires_at, uploaded_by, created_at, document_links(entity_type, entity_id)",
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status === "active" || status === "archived") query = query.eq("status", status);
  else query = query.neq("status", "superseded");
  if (type !== "all") query = query.eq("doc_type", type);
  if (/^[0-9a-f-]{36}$/i.test(owner)) query = query.eq("uploaded_by", owner);
  if (q) {
    const like = `%${q.replaceAll("%", "").replaceAll(",", " ")}%`;
    query = query.or(`title.ilike.${like},filename.ilike.${like}`);
  }
  if (view === "expiring") {
    const cutoff = new Date(Date.now() + EXPIRING_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    query = query.not("expires_at", "is", null).lte("expires_at", cutoff);
  }

  const [{ data: docsData }, { data: askDocsData }, { count: activeCount }, { count: expiringCount }] =
    await Promise.all([
      query,
      supabase
        .from("ask_documents")
        .select("id, ask_id, filename, label, size_bytes, uploaded_by, created_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("status", "active"),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("status", "active")
        .not("expires_at", "is", null)
        .lte("expires_at", new Date(Date.now() + EXPIRING_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)),
    ]);

  const docs = (docsData ?? []) as unknown as DocRow[];
  const askDocs = (askDocsData ?? []) as AskDocRow[];

  // Resolve every linked entity in one batched pass, then hand chips out per row.
  const allLinks = docs.flatMap((d) => d.document_links ?? []);
  const resolved = await resolveEntities(allLinks.map((l) => ({ type: l.entity_type, id: l.entity_id })));
  const chipByKey = new Map(allLinks.map((l, i) => [`${l.entity_type}:${l.entity_id}`, resolved[i]]));

  const ownerIds = Array.from(new Set(docs.map((d) => d.uploaded_by).filter(Boolean))) as string[];
  const names = await getDisplayNames(ownerIds);

  const today = todayISO();
  const typeOptions = [{ value: "all", label: "All types" }].concat(
    DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] })),
  );
  // Params each FilterTabs must preserve while switching its own key.
  const all = { view, status, type, ...(owner !== "all" ? { owner } : {}), ...(q ? { q } : {}) };
  const keepFor = (omit: string): Record<string, string> => {
    const o: Record<string, string> = { ...all };
    delete o[omit];
    return o;
  };

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1200px]">
      <PageHeader
        title="Documents"
        subtitle="Every file in the org — attached to the records it belongs to"
        actions={<UploadDocumentButton />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard label="Active documents" value={activeCount ?? 0} />
        <StatCard
          label={`Expiring within ${EXPIRING_WINDOW_DAYS} days`}
          value={expiringCount ?? 0}
          muted={(expiringCount ?? 0) === 0}
        />
        <StatCard label="Ask files (fundraising)" value={askDocs.length} sub="read-only here" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterTabs
          options={[
            { value: "all", label: "All" },
            { value: "expiring", label: "Expiring soon" },
          ]}
          current={view}
          paramKey="view"
          basePath="/admin/documents"
          extraParams={keepFor("view")}
        />
        <FilterTabs
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "Any status" },
          ]}
          current={status}
          paramKey="status"
          basePath="/admin/documents"
          extraParams={keepFor("status")}
          size="sm"
        />
        <FilterTabs
          options={typeOptions}
          current={type}
          paramKey="type"
          basePath="/admin/documents"
          extraParams={keepFor("type")}
          size="sm"
        />
        <form action="/admin/documents" className="ml-auto">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="type" value={type} />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search title or filename…"
            className="bg-tile border-[1.5px] border-outline rounded-full px-4 py-1.5 text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-orange/40 w-56"
          />
        </form>
      </div>

      <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden mb-8">
        {docs.length === 0 ? (
          <p className="p-5 text-sm text-ink-2">
            {view === "expiring" ? "Nothing expires in the window — all current." : "No documents match."}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {docs.map((d) => {
              const expired = d.expires_at != null && d.expires_at < today;
              return (
                <li key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/admin/documents/${d.id}/url`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-ink-1 hover:text-orange transition-colors truncate inline-block max-w-full"
                    >
                      {d.title || d.filename}
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {d.doc_type && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                          {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                        </span>
                      )}
                      {d.visibility === "restricted" && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-status-critical-bg text-status-critical-text">
                          Restricted
                        </span>
                      )}
                      {(d.document_links ?? []).map((l) => {
                        const chip = chipByKey.get(`${l.entity_type}:${l.entity_id}`);
                        return chip ? (
                          <EntityChip key={`${l.entity_type}:${l.entity_id}`} entity={chip} className="max-w-[14rem]" />
                        ) : null;
                      })}
                    </div>
                  </div>
                  {d.issued_at && (
                    <span className="text-[11px] text-ink-3 whitespace-nowrap hidden sm:inline">
                      Issued {d.issued_at}
                    </span>
                  )}
                  {d.expires_at && (
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        expired ? "bg-expense-bg text-expense" : "bg-status-due-bg text-ink-1"
                      }`}
                    >
                      {expired ? "Expired" : "Expires"} {d.expires_at}
                    </span>
                  )}
                  <span className="text-[11px] text-ink-3 whitespace-nowrap hidden sm:inline">
                    {d.uploaded_by ? (names[d.uploaded_by] ?? "—") : "—"}
                  </span>
                  <span className="text-[11px] text-ink-3 whitespace-nowrap hidden md:inline">{fmtSize(d.size_bytes)}</span>
                  <span className="text-[11px] text-ink-3 whitespace-nowrap hidden lg:inline">{fmtDate(d.created_at)}</span>
                  <DocumentActions id={d.id} status={d.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {askDocs.length > 0 && (
        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-outline">
            <h2 className={TYPE.cardTitle}>Ask files (fundraising)</h2>
            <p className="text-xs text-ink-2 mt-0.5">
              Managed on their asks — shown here so the org&apos;s files read as one list. Consolidation into the hub is
              a tracked follow-on.
            </p>
          </div>
          <ul className="divide-y divide-hairline">
            {askDocs.map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                <a
                  href={`/api/admin/asks/${a.ask_id}/documents/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 text-sm font-medium text-ink-1 hover:text-orange transition-colors truncate"
                >
                  {a.label || a.filename}
                </a>
                <Link
                  href={`/admin/fundraising/asks/${a.ask_id}`}
                  className="text-[11px] font-semibold text-orange hover:text-orange-dark whitespace-nowrap"
                >
                  View ask →
                </Link>
                <span className="text-[11px] text-ink-3 whitespace-nowrap hidden md:inline">{fmtSize(a.size_bytes)}</span>
                <span className="text-[11px] text-ink-3 whitespace-nowrap hidden lg:inline">{fmtDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
