import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ProspectFilters from "../_components/ProspectFilters";
import ProspectListTable, {
  type ProspectRow,
  type SortKey,
  type SortDir,
} from "../_components/ProspectListTable";

// ── searchParams parsing ───────────────────────────────────────────────────

type SearchParams = {
  q?: string;
  lifecycle?: string;
  owner?: string;
  scored?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const VALID_SORT: ReadonlyArray<SortKey> = ["name", "last_activity", "score"];

function parseSearchParams(sp: SearchParams) {
  const q = (sp.q ?? "").trim();
  const lifecycle = (sp.lifecycle ?? "").trim();
  const owner = (sp.owner ?? "").trim();
  const scored = sp.scored === "1";
  const sort: SortKey = VALID_SORT.includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "last_activity";
  const dir: SortDir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  return { q, lifecycle, owner, scored, sort, dir, page };
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

const PAGE_SIZE = 50;
const SELECT_COLS =
  "hubspot_id, email, first_name, last_name, company, lifecycle_stage, owner_id, last_activity_at";

// Strip chars that break Supabase's .or() filter parser (commas,
// parens, asterisk) or that would inject wildcards (%).
function sanitizeSearch(s: string): string {
  return s.replace(/[,()*%]/g, "").trim();
}

function sortContacts(
  rows: ProspectRow[],
  sort: SortKey,
  dir: SortDir
): ProspectRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmpStr = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1; // nulls always last
    if (b === null || b === undefined) return -1;
    return a.localeCompare(b) * sign;
  };
  const cmpTime = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return (new Date(a).getTime() - new Date(b).getTime()) * sign;
  };
  const cmpNum = (a: number | null, b: number | null) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    return (a - b) * sign;
  };

  return [...rows].sort((x, y) => {
    if (sort === "name") {
      const xn = `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || x.email;
      const yn = `${y.first_name ?? ""} ${y.last_name ?? ""}`.trim() || y.email;
      return cmpStr(xn, yn);
    }
    if (sort === "last_activity") return cmpTime(x.last_activity_at, y.last_activity_at);
    return cmpNum(x.score_total, y.score_total);
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function FundraisingProspectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, lifecycle, owner, scored, sort, dir, page } =
    parseSearchParams(searchParams);

  const supabase = getSupabaseAdmin();

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
    console.error("[/admin/fundraising] contacts query failed:", {
      code: contactsErr.code,
      message: contactsErr.message,
    });
  }
  const contacts: ContactSlim[] = (contactsRaw as ContactSlim[] | null) ?? [];

  // Query 2: matching scores via IN(). Two-query merge instead of a join
  // because there's no FK between hs_contacts.hubspot_id and
  // fr_prospect_scores.hubspot_contact_id (PR 4 design — a prospect can
  // be scored before the next sync runs).
  let scoreMap = new Map<string, number | null>();
  if (contacts.length > 0) {
    const ids = contacts.map((c) => c.hubspot_id);
    const { data: scoresRaw, error: scoresErr } = await supabase
      .from("fr_prospect_scores")
      .select("hubspot_contact_id, score_total")
      .in("hubspot_contact_id", ids);
    if (scoresErr) {
      console.error("[/admin/fundraising] scores query failed:", {
        code: scoresErr.code,
        message: scoresErr.message,
      });
    }
    const scores: ScoreSlim[] = (scoresRaw as ScoreSlim[] | null) ?? [];
    scoreMap = new Map(scores.map((s) => [s.hubspot_contact_id, s.score_total]));
  }

  // Merge, scored-only filter, sort, paginate — all in JS for v1. With
  // ~2.5k contacts and filters narrowing further, this stays fast.
  let merged: ProspectRow[] = contacts.map((c) => ({
    ...c,
    score_total: scoreMap.get(c.hubspot_id) ?? null,
  }));
  if (scored) merged = merged.filter((m) => m.score_total !== null);

  const sorted = sortContacts(merged, sort, dir);
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

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

  function buildSortHref(nextSort: SortKey, nextDir: SortDir): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lifecycle) params.set("lifecycle", lifecycle);
    if (owner) params.set("owner", owner);
    if (scored) params.set("scored", "1");
    params.set("sort", nextSort);
    params.set("dir", nextDir);
    return `/admin/fundraising?${params.toString()}`;
  }

  function buildPageHref(p: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lifecycle) params.set("lifecycle", lifecycle);
    if (owner) params.set("owner", owner);
    if (scored) params.set("scored", "1");
    if (sort !== "last_activity") params.set("sort", sort);
    if (dir !== "desc") params.set("dir", dir);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/fundraising?${s}` : "/admin/fundraising";
  }

  const fromIdx = totalCount === 0 ? 0 : start + 1;
  const toIdx = Math.min(start + PAGE_SIZE, totalCount);

  return (
    <div className="max-w-6xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
          Fundraising
        </h1>
        <div className="text-xs text-gray-mid">
          {totalCount > 0 ? (
            <>
              Showing <span className="text-cream">{fromIdx}–{toIdx}</span> of{" "}
              <span className="text-cream">{totalCount}</span>
            </>
          ) : (
            "No matching prospects"
          )}
        </div>
      </header>

      <ProspectFilters
        q={q}
        lifecycle={lifecycle}
        owner={owner}
        scored={scored}
        lifecycleOptions={lifecycleOptions}
        ownerOptions={ownerOptions}
      />

      <ProspectListTable
        rows={pageRows}
        sort={sort}
        dir={dir}
        buildSortHref={buildSortHref}
      />

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between text-xs text-gray-mid"
        >
          <div>
            Page <span className="text-cream">{safePage}</span> of{" "}
            <span className="text-cream">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <PaginationLink
              disabled={safePage <= 1}
              href={buildPageHref(safePage - 1)}
              label="← Prev"
            />
            <PaginationLink
              disabled={safePage >= totalPages}
              href={buildPageHref(safePage + 1)}
              label="Next →"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function PaginationLink({
  disabled,
  href,
  label,
}: {
  disabled: boolean;
  href: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-lg border border-white/5 text-gray-mid/50 cursor-default">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg border border-white/10 text-cream/80 hover:text-cream hover:bg-white/5"
    >
      {label}
    </Link>
  );
}
