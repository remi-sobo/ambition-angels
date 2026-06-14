import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FinCategory } from "@/lib/finance/types";
import TransactionFilters from "./_components/TransactionFilters";
import CategoryPicker from "./_components/CategoryPicker";
import RestrictedToggle from "./_components/RestrictedToggle";

type SearchParams = {
  q?: string;
  category?: string;
  from?: string;
  to?: string;
  status?: string;
  page?: string;
};

const PAGE_SIZE = 100;

function isISO(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

// Sanitize for Supabase's .or() filter syntax: commas, parens, asterisks
// and percent signs all have meaning. Mirrors fundraising/page.tsx.
function sanitizeSearch(s: string): string {
  return s.replace(/[,()*%]/g, "").trim();
}

type TxnRow = {
  id: string;
  txn_date: string;
  description: string;
  amount: number;
  category_id: string | null;
  restricted: boolean;
  restricted_to: string | null;
  source_file: string | null;
  notes: string | null;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = (searchParams.q ?? "").trim();
  const category = (searchParams.category ?? "").trim();
  const from = isISO(searchParams.from) ? searchParams.from : "";
  const to = isISO(searchParams.to) ? searchParams.to : "";
  const status = (searchParams.status ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const supabase = getSupabaseAdmin();

  // Categories — needed for the picker, the filter dropdown, and the
  // category-id → display-name lookup in the table.
  const { data: catsRaw } = await supabase
    .from("fin_categories")
    .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
    .eq("enabled", true)
    .order("sort_order");
  const categories = (catsRaw ?? []) as FinCategory[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Build the transactions query — most filters are server-side; only
  // status=restricted requires post-filter (Supabase can do it natively
  // but the OR-logic is simple enough).
  let qb = supabase
    .from("fin_transactions")
    .select(
      "id, txn_date, description, amount, category_id, restricted, restricted_to, source_file, notes",
      { count: "exact" }
    );

  const safeQ = sanitizeSearch(q);
  if (safeQ) qb = qb.ilike("description", `%${safeQ}%`);
  if (category === "uncategorized") qb = qb.is("category_id", null);
  else if (category) qb = qb.eq("category_id", category);
  if (from) qb = qb.gte("txn_date", from);
  if (to) qb = qb.lte("txn_date", to);
  if (status === "inflow") qb = qb.gt("amount", 0);
  else if (status === "outflow") qb = qb.lt("amount", 0);
  else if (status === "restricted") qb = qb.eq("restricted", true);

  qb = qb.order("txn_date", { ascending: false }).order("id", { ascending: false });

  const start = (page - 1) * PAGE_SIZE;
  qb = qb.range(start, start + PAGE_SIZE - 1);

  const { data: rowsRaw, count, error } = await qb;
  if (error) {
    console.error("[finance/transactions] query failed:", error.message);
  }
  const rows = (rowsRaw ?? []) as TxnRow[];
  const total = count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // Uncategorized count across the whole table (not just current page) —
  // used by the header CTA so it stays honest regardless of filters.
  const { count: uncategorizedCount } = await supabase
    .from("fin_transactions")
    .select("id", { count: "exact", head: true })
    .is("category_id", null);

  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-xs text-gray-mid mb-1">
            <Link href="/admin/finance" className="hover:text-cream">
              ← Finance
            </Link>
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-cream text-3xl sm:text-4xl leading-none">
            Transactions
          </h1>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {uncategorizedCount && uncategorizedCount > 0 ? (
            <Link
              href="/admin/finance/transactions?category=uncategorized"
              className="rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200 px-3 py-1 hover:bg-amber-500/20"
            >
              {uncategorizedCount} uncategorized →
            </Link>
          ) : null}
          <Link
            href="/admin/finance/upload"
            className="rounded-full bg-orange hover:bg-orange-dark text-cream px-3 py-1"
          >
            + Import CSV
          </Link>
        </div>
      </header>

      <TransactionFilters categories={categories} />

      <div className="rounded-card-lg border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03] text-gray-mid uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2.5 w-[6.5rem]">Date</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-right px-3 py-2.5 w-32">Amount</th>
                <th className="text-left px-3 py-2.5 w-64">Category</th>
                <th className="text-left px-3 py-2.5 w-32">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-gray-mid">
                    {total === 0
                      ? "No transactions yet — upload a CSV to get started."
                      : "No transactions match these filters."}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const cat = r.category_id ? catById.get(r.category_id) : null;
                return (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.015]">
                    <td className="px-3 py-2 font-mono text-cream/90 align-top">
                      {r.txn_date}
                    </td>
                    <td className="px-3 py-2 text-cream/85 max-w-md align-top">
                      <div className="truncate" title={r.description}>
                        {r.description}
                      </div>
                      {r.source_file && (
                        <div className="text-[10px] text-gray-mid mt-0.5 truncate">
                          {r.source_file}
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono align-top ${
                        r.amount >= 0 ? "text-emerald-300" : "text-cream/85"
                      }`}
                    >
                      {fmtMoney(r.amount)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CategoryPicker
                        transactionId={r.id}
                        initialCategoryId={r.category_id}
                        categories={categories}
                      />
                      {cat?.functional_class && (
                        <div className="text-[10px] text-gray-mid mt-1 uppercase tracking-wider">
                          {cat.functional_class}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <RestrictedToggle
                        transactionId={r.id}
                        initial={r.restricted}
                      />
                      {r.restricted && r.restricted_to && (
                        <div className="text-[10px] text-orange/80 mt-1">
                          → {r.restricted_to}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-4 flex items-center justify-between text-xs text-gray-mid"
        >
          <div>
            Page <span className="text-cream">{safePage}</span> of{" "}
            <span className="text-cream">{totalPages}</span> ·{" "}
            <span className="text-cream">{total.toLocaleString()}</span> total
          </div>
          <div className="flex gap-2">
            <PageLink
              params={searchParams}
              page={safePage - 1}
              disabled={safePage <= 1}
              label="← Prev"
            />
            <PageLink
              params={searchParams}
              page={safePage + 1}
              disabled={safePage >= totalPages}
              label="Next →"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: SearchParams;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="px-3 py-1.5 rounded-lg border border-white/5 text-gray-mid/40 cursor-default">
        {label}
      </span>
    );
  }
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.length > 0 && k !== "page") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return (
    <Link
      href={s ? `/admin/finance/transactions?${s}` : "/admin/finance/transactions"}
      className="px-3 py-1.5 rounded-lg border border-white/10 text-cream/80 hover:text-cream hover:bg-white/5"
    >
      {label}
    </Link>
  );
}
