import Link from "next/link";
import EmptyState from "../../_components/EmptyState";
import NoCategories from "../_components/NoCategories";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { FinCategory } from "@/lib/finance/types";
import TransactionFilters from "./_components/TransactionFilters";
import CategoryPicker from "./_components/CategoryPicker";
import RestrictedToggle from "./_components/RestrictedToggle";
import ExcludeFromRunwayToggle from "./_components/ExcludeFromRunwayToggle";
import AiCategorize from "./_components/AiCategorize";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import Button from "../../_components/ui/Button";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import ReconcileSection from "../reconcile/ReconcileSection";
import CloseSection from "../close/CloseSection";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";
import { applyTableSort, parseTableState, rowRange, type DataTableBulkAction } from "@/lib/admin/dataTable";
import {
  TX_BASE,
  TX_SORT_COLUMNS,
  TX_TABLE,
  parseTxFilters,
  sanitizeTxSearch,
  txFilterParams,
  txNextStep,
} from "@/lib/finance/transactionsList";
import { loadUncategorized } from "@/lib/finance/uncategorized";
import { ctxHasPermission } from "@/lib/admin/auth";

// Finance → Transactions: the List archetype on DataTable v2 (V4 Stage G2).
// Filters live in the URL (q, category, from, to, status), the server pages
// and sorts, rows become cards under 640px, and a bulk "Categorize as…"
// writes through /api/admin/finance/transactions/bulk (finance.write, pinned
// to the active org, category must be this org's). The reconcile inbox and
// the Friday close stay embedded below, as since Spec Finance N1.
export const dynamic = "force-dynamic";

type TxnRow = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  category_id: string | null;
  restricted: boolean;
  restricted_to: string | null;
  exclude_from_runway: boolean;
  source_file: string | null;
  notes: string | null;
};

const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtWhole = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtDay = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

export default async function TransactionsPage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return roleGate.page;

  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell>
        <PageHeader title="Transactions" subtitle="Sign in to view transactions." />
      </PageShell>
    );
  }
  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org.
  const orgId = ctx.orgId;
  const supabase = getSupabaseAdmin();
  const filters = parseTxFilters(searchParams);
  const state = parseTableState(searchParams, TX_TABLE);
  const canWrite = await ctxHasPermission(ctx, "finance.write");

  const { data: catsRaw } = await supabase
    .from("fin_categories")
    .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .order("sort_order");
  const categories = (catsRaw ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  let qb = supabase
    .from("fin_transactions")
    .select(
      "id, txn_date, description, amount, category_id, restricted, restricted_to, exclude_from_runway, source_file, notes",
      { count: "exact" },
    )
    .eq("org_id", orgId);
  const safeQ = sanitizeTxSearch(filters.q);
  if (safeQ) qb = qb.ilike("description", `%${safeQ}%`);
  if (filters.category === "uncategorized") qb = qb.is("category_id", null);
  else if (filters.category) qb = qb.eq("category_id", filters.category);
  if (filters.from) qb = qb.gte("txn_date", filters.from);
  if (filters.to) qb = qb.lte("txn_date", filters.to);
  if (filters.status === "inflow") qb = qb.gt("amount", 0);
  else if (filters.status === "outflow") qb = qb.lt("amount", 0);
  else if (filters.status === "restricted") qb = qb.eq("restricted", true);
  qb = applyTableSort(qb, state.sort, TX_SORT_COLUMNS, "");
  qb = qb.order("id", { ascending: false });
  const { from, to } = rowRange(state.page, TX_TABLE.pageSize);
  qb = qb.range(from, to);

  const [{ data: rowsRaw, count, error }, { count: orgTxnCount, error: orgCountError }, uncat] = await Promise.all([
    qb,
    // Any transaction at all, unfiltered: the first-run signal (a
    // filtered-to-zero view is not a first run).
    supabase.from("fin_transactions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    loadUncategorized(supabase, orgId),
  ]);
  if (error) console.error("[finance/transactions] query failed:", error.message);
  const rows = ((rowsRaw ?? []) as TxnRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
  const total = count ?? rows.length;
  const orgTotal = orgTxnCount ?? 0;
  const firstRun = !orgCountError && orgTotal === 0;
  const fp = txFilterParams(filters);
  const rowName = (r: TxnRow) => `${r.description}, ${fmtDay(r.txn_date)}`;

  const columns: DataTableColumn<TxnRow>[] = [
    {
      key: "description",
      header: "Description",
      card: "title",
      render: (r) => (
        <div className="min-w-0 max-w-md">
          <div className="font-semibold text-ink-1 truncate" title={r.description}>
            {r.description}
          </div>
          {r.source_file ? <div className="text-xs text-ink-2 truncate">{r.source_file}</div> : null}
          {r.restricted && r.restricted_to ? <div className="text-xs text-ink-2">For {r.restricted_to}</div> : null}
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      className: "text-ink-2 tabular-nums whitespace-nowrap",
      render: (r) => fmtDay(r.txn_date),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      render: (r) => (
        <span className={r.amount >= 0 ? "text-status-healthy-text font-semibold" : "text-ink-1"}>{fmtMoney(r.amount)}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (r) =>
        canWrite ? (
          <CategoryPicker
            transactionId={r.id}
            initialCategoryId={r.category_id}
            categories={categories}
            label={`Category for ${rowName(r)}`}
          />
        ) : (
          <span className={r.category_id ? "text-ink-1" : "text-status-watch-text"}>
            {r.category_id ? catById.get(r.category_id)?.display_name ?? r.category_id : "Uncategorized"}
          </span>
        ),
    },
    {
      key: "flags",
      header: "Flags",
      render: (r) =>
        canWrite ? (
          <div className="flex flex-wrap gap-1.5">
            <RestrictedToggle transactionId={r.id} initial={r.restricted} rowLabel={rowName(r)} />
            {r.amount < 0 ? (
              <ExcludeFromRunwayToggle transactionId={r.id} initial={r.exclude_from_runway} rowLabel={rowName(r)} />
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-ink-2">
            {r.restricted ? "Restricted" : "Unrestricted"}
            {r.amount < 0 && r.exclude_from_runway ? ", left out of runway" : ""}
          </span>
        ),
    },
  ];

  const bulkActions: DataTableBulkAction[] =
    canWrite && categories.length > 0
      ? [
          {
            kind: "choose",
            key: "categorize",
            label: "Categorize as",
            url: "/api/admin/finance/transactions/bulk",
            field: "category_id",
            options: [
              ...categories.map((c) => ({ value: c.id, label: `${c.display_name} (${c.group_name})` })),
              { value: "", label: "Uncategorized" },
            ],
            success: "Set to {label}",
          },
        ]
      : [];

  return (
    <PageShell>
      <PageHeader
        title="Transactions"
        subtitle="Every bank line, with its category. Runway, burn and budget vs actual all read from here."
        primaryAction={
          canWrite ? (
            <Button href="/admin/settings/finance/upload">Import CSV</Button>
          ) : undefined
        }
        secondaryActions={canWrite ? <AiCategorize uncategorizedCount={uncat.count} /> : undefined}
        moreActions={[
          { label: "Show uncategorized", href: `${TX_BASE}?category=uncategorized` },
          { label: "Reconcile inbox", href: "#reconcile" },
          { label: "Friday close", href: "#close" },
          { label: "Category rules", href: "/admin/settings/finance/rules" },
          { label: "Finance snapshot", href: "/admin/finance/snapshot" },
        ]}
      />

      {categories.length === 0 ? (
        <div className="mb-4">
          <NoCategories />
        </div>
      ) : null}

      <TransactionFilters categories={categories} filters={filters} disabled={firstRun} />

      <SummaryStrip label="Summary for this view">
        <Figure
          label="In this view"
          value={error ? null : total}
          source={error ? "The list failed to load." : "Transactions matching these filters, as of now"}
        />
        <Figure
          label="Need a category"
          value={uncat.error ? null : uncat.count}
          href={uncat.count > 0 ? `${TX_BASE}?category=uncategorized` : undefined}
          compare={!uncat.error && uncat.count > 0 ? `${fmtWhole(uncat.total)} in all` : undefined}
          source={
            uncat.error
              ? "Could not count uncategorized transactions."
              : uncat.oldest
                ? `Across your whole ledger. Oldest is from ${fmtDay(uncat.oldest)}.`
                : "Across your whole ledger, as of now"
          }
        />
        <Figure
          label="In the ledger"
          value={orgCountError ? null : orgTotal}
          source={orgCountError ? "Could not count the ledger." : "Every imported transaction, as of now"}
        />
      </SummaryStrip>

      <DataTable
        label="Transactions"
        noun={{ one: "transaction", many: "transactions" }}
        columns={columns}
        nextStep={{
          header: "Next step",
          render: (r) => {
            const n = txNextStep(r);
            return <span className={n.tone === "warning" ? "text-status-watch-text font-semibold" : "text-ink-2"}>{n.label}</span>;
          },
        }}
        data={{ rows, total, page: state.page, pageSize: TX_TABLE.pageSize, error: error ? error.message : null }}
        getRowId={(r) => r.id}
        getRowLabel={rowName}
        spec={TX_TABLE}
        state={state}
        baseHref={TX_BASE}
        filters={fp}
        bulkActions={bulkActions}
        minWidth={960}
        empty={
          firstRun ? (
            <EmptyState
              label="transactions"
              purpose="The ledger fills from your bank exports. Runway, burn and budget vs actual all start here."
              primaryAction={canWrite ? <Button href="/admin/settings/finance/upload">Import the first CSV</Button> : undefined}
            />
          ) : undefined
        }
        emptyMessage={
          <>
            No transactions match these filters.{" "}
            <Link href={TX_BASE} className="font-semibold underline underline-offset-2">
              Clear filters
            </Link>
          </>
        }
      />

      {/* Spec Finance N1: the one bookkeeping surface. Ledger above, the
          reconcile inbox and the gated Friday close below. */}
      <div id="reconcile" className="scroll-mt-24">
        <ReconcileSection embedded />
      </div>
      <div id="close" className="scroll-mt-24">
        <CloseSection embedded />
      </div>
    </PageShell>
  );
}
