import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import type { FinCategory } from "@/lib/finance/types";
import BudgetEditor, { type BudgetRow } from "./_components/BudgetEditor";
import NoCategories from "../_components/NoCategories";
import PageHeader from "../../_components/PageHeader";
import PageShell from "../../_components/ui/PageShell";
import Button from "../../_components/ui/Button";
import SegmentedControl from "../../_components/ui/SegmentedControl";
import { requirePagePermission } from "@/app/admin/_components/PermissionGate";

type SearchParams = { year?: string };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const roleGate = await requirePagePermission("finance.read", "Finance");
  if (!roleGate.ok) return roleGate.page;
  const supabase = getSupabaseAdmin();

  // Year resolution: ?year=N overrides; otherwise the singleton fin_config
  // row tells us the active fiscal year; otherwise default to the current
  // calendar year. Clamp to a reasonable range.
  // Org fence: the service-role client bypasses RLS, so every read below is
  // scoped to the active org. No session → nothing to show.
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <PageShell>
        <PageHeader title="Budget" subtitle="Sign in to view the budget." />
      </PageShell>
    );
  }
  const orgId = ctx.orgId;
  const { data: cfg } = await supabase
    .from("fin_config")
    .select("current_year")
    .eq("org_id", orgId)
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
      .eq("org_id", orgId)
      .eq("enabled", true)
      .order("sort_order"),
    supabase
      .from("fin_budget")
      .select(
        "year, category_id, base_amount, contingency_t1, contingency_t2, activated_contingency"
      )
      .eq("org_id", orgId)
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

  // List archetype (V4 Stage G2): one primary action, the year as a
  // link-driven segmented control, the editor on DataTable v2.
  return (
    <PageShell>
      <PageHeader
        title={`Budget ${year}`}
        subtitle="Base plus Tier 1 and Tier 2 contingency for each line. Activated contingency turns on once fundraising crosses the unlock threshold."
        secondaryActions={
          <SegmentedControl
            label="Budget year"
            segments={years.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(year)}
            hrefFor={(y) => `/admin/finance/budget?year=${y}`}
          />
        }
        moreActions={[
          { label: "Budget vs actual on the snapshot", href: "/admin/finance/snapshot" },
          { label: "Finance categories", href: "/admin/settings/finance" },
        ]}
        primaryAction={<Button href={`/admin/settings/finance/budget-import?year=${year}`}>Import from QuickBooks</Button>}
      />

      {categories.length === 0 ? (
        <NoCategories />
      ) : (
        <BudgetEditor year={year} categories={categories} initialBudget={initialBudget} />
      )}
    </PageShell>
  );
}
