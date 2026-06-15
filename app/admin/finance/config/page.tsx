import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import ConfigEditor, { type FinConfig } from "./_components/ConfigEditor";

export default async function ConfigPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("fin_config")
    .select(
      "current_year, fiscal_year_start_month, fundraising_goal, contingency_unlock_threshold, cash_starting_balance, cash_starting_date"
    )
    .eq("id", 1)
    .maybeSingle();

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
  };

  return (
    <div className="max-w-3xl px-4 lg:px-8 py-6 lg:py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3 text-xs text-ink-2 mb-1">
          <Link href="/admin/finance" className="hover:text-ink-1">
            ← Finance
          </Link>
        </div>
        <h1 className="font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none">
          Configuration
        </h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl">
          Global settings that the dashboard uses for runway, budget rollups,
          and fundraising progress. You probably set these once at the start
          of each fiscal year and rarely touch them again.
        </p>
      </header>

      <ConfigEditor initial={initial} />
    </div>
  );
}
