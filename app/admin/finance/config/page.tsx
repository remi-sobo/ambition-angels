import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import ConfigEditor, { type FinConfig } from "./_components/ConfigEditor";
import PageHeader from "../../_components/PageHeader";

// Read live every request so the form always seeds from the latest saved row
// (the service-role read otherwise risks Next's Data Cache). Matches the rest
// of the admin app.
export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const ctx = await getOrgContext();
  const supabase = getSupabaseAdmin();
  const { data } = ctx
    ? await supabase
        .from("fin_config")
        .select(
          "current_year, fiscal_year_start_month, fundraising_goal, contingency_unlock_threshold, cash_starting_balance, cash_starting_date, monthly_burn_baseline, forward_horizon_months, runway_target_months"
        )
        .eq("org_id", ctx.orgId)
        .maybeSingle()
    : { data: null };

  // Fall back to sane defaults if the singleton isn't seeded yet (shouldn't
  // happen — the migration seeds it — but defensive for fresh databases).
  const initial: FinConfig = {
    current_year: typeof data?.current_year === "number" ? data.current_year : new Date().getFullYear(),
    fiscal_year_start_month: typeof data?.fiscal_year_start_month === "number" ? data.fiscal_year_start_month : 1,
    fundraising_goal: data?.fundraising_goal === null || data?.fundraising_goal === undefined
      ? null
      : Number(data.fundraising_goal),
    contingency_unlock_threshold:
      data?.contingency_unlock_threshold === null || data?.contingency_unlock_threshold === undefined
        ? null
        : Number(data.contingency_unlock_threshold),
    cash_starting_balance:
      data?.cash_starting_balance === null || data?.cash_starting_balance === undefined
        ? null
        : Number(data.cash_starting_balance),
    cash_starting_date: data?.cash_starting_date ?? null,
    monthly_burn_baseline:
      data?.monthly_burn_baseline === null || data?.monthly_burn_baseline === undefined
        ? null
        : Number(data.monthly_burn_baseline),
    forward_horizon_months:
      data?.forward_horizon_months === null || data?.forward_horizon_months === undefined
        ? null
        : Number(data.forward_horizon_months),
    runway_target_months:
      data?.runway_target_months === null || data?.runway_target_months === undefined
        ? null
        : Number(data.runway_target_months),
  };

  return (
    <div className="max-w-3xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="mb-2">
        <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
          <Link href="/admin/finance" className="hover:text-ink-1">
            ← Finance
          </Link>
        </div>
        <PageHeader
          title="Configuration"
          subtitle={
            <span className="block max-w-2xl">
              Global settings that the dashboard uses for runway, budget rollups,
              and fundraising progress. You probably set these once at the start
              of each fiscal year and rarely touch them again.
            </span>
          }
        />
      </header>

      <ConfigEditor initial={initial} />
    </div>
  );
}
