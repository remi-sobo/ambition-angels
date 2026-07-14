import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FinCategory } from "@/lib/finance/types";
import BudgetEditor, { type BudgetRow } from "./_components/BudgetEditor";
import NarrativeBackLink from "../../_components/NarrativeBackLink";

type SearchParams = { year?: string; from?: string };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = getSupabaseAdmin();

  // Year resolution: ?year=N overrides; otherwise the singleton fin_config
  // row tells us the active fiscal year; otherwise default to the current
  // calendar year. Clamp to a reasonable range.
  const { data: cfg } = await supabase
    .from("fin_config")
    .select("current_year")
    .eq("id", 1)
    .maybeSingle();
  const configYear =
    typeof cfg?.current_year === "number" ? cfg.current_year : new Date().getFullYear();
  const requested = parseInt(searchParams.year ?? "", 10);
  const year =
    Number.isFinite(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : configYear;

  const [{ data: catsRaw }, { data: budgetRaw }] = await Promise.all([
    supabase
      .from("fin_categories")
      .select("id, group_name, display_name, kind, functional_class, sort_order, enabled")
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("fin_budget")
      .select(
        "year, category_id, base_amount, contingency_t1, contingency_t2, activated_contingency"
      )
      .eq("year", year),
  ]);
  const categories = (catsRaw ?? []) as FinCategory[];
  const initialBudget = (budgetRaw ?? []).map((r) => ({
    year: r.year,
    category_id: r.category_id,
    // numeric columns come back as strings via supabase-js — coerce.
    base_amount: Number(r.base_amount ?? 0),
    contingency_t1: Number(r.contingency_t1 ?? 0),
    contingency_t2: Number(r.contingency_t2 ?? 0),
    activated_contingency: Number(r.activated_contingency ?? 0),
  })) as BudgetRow[];

  // Year picker options — show a small window around the active year.
  const years = [year - 1, year, year + 1].filter((y) => y >= 2024 && y <= 2030);

  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8">
      <NarrativeBackLink from={searchParams.from} />
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
            <Link href="/admin/finance" className="hover:text-ink-1">
              ← Finance
            </Link>
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
            Budget · {year}
          </h1>
          <p className="mt-2 text-sm text-ink-2 max-w-2xl">
            Mirrors the Budget-{year} workbook tab. Base + Tier 1 / Tier 2
            contingency per line item. Activated contingency flips on once
            fundraising crosses the unlock threshold.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/admin/finance/budget/import?year=${year}`}
            className="px-3 py-1 rounded-full border border-orange/40 bg-orange/15 text-orange hover:bg-orange/25"
          >
            ⇪ Import from QuickBooks
          </Link>
          <span className="text-ink-2">·</span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/admin/finance/budget?year=${y}`}
              className={`px-3 py-1 rounded-full border ${
                y === year
                  ? "border-orange/60 bg-orange/15 text-orange"
                  : "border-outline text-ink-2 hover:text-ink-1"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      <BudgetEditor year={year} categories={categories} initialBudget={initialBudget} />
    </div>
  );
}
