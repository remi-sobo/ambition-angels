import { getFinanceSnapshot } from "@/lib/admin/finance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import PageHeader from "../../_components/PageHeader";
import ForecastBoard, { type SeedLever } from "./_components/ForecastBoard";

// Forecast / scenario planning. Starts from the canonical cash + burn and lets
// the CEO stack levers (a hire, a grant landing, a campaign) to see when cash
// runs out under each scenario. Seeded with real future-dated commitments so it
// opens informed. No new tables — the scenario lives client-side.
export const dynamic = "force-dynamic";

export default async function FinanceForecastPage() {
  const snap = await getFinanceSnapshot();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Seed income levers from secured/projected commitments expected in the
  // future. Projected gifts are weighted by probability (a verbal maybe at 50%
  // shouldn't show as guaranteed cash); secured come in at full value.
  const { data } = await sb
    .from("fin_revenue_commitments")
    .select("source_name, source_type, amount, status, expected_date, probability")
    .in("status", ["secured", "projected"])
    .gte("expected_date", today)
    .order("expected_date", { ascending: true })
    .limit(30);

  const seeds: SeedLever[] = (data ?? [])
    .map((r) => {
      const weighted = r.status === "projected" ? (r.probability == null ? 1 : Number(r.probability)) : 1;
      return {
        label: (r.source_name as string) || (r.source_type as string) || "Expected gift",
        amount: Math.round(Number(r.amount) * weighted),
        date: r.expected_date as string,
        status: r.status as string,
      };
    })
    .filter((s) => s.amount > 0 && !!s.date);

  return (
    <div className="max-w-5xl px-4 lg:px-8 py-6 lg:py-8 space-y-6">
      <PageHeader
        eyebrow="Scenario planning"
        title="Forecast"
        subtitle="Project cash forward and stack what-ifs — a hire, a grant landing, a slip — to see when you run out under each scenario."
      />
      <ForecastBoard
        cashOnHand={snap.cashOnHand}
        monthlyBurn={snap.runway.inputs.baseline}
        burnSource={snap.runway.inputs.baselineSource}
        seeds={seeds}
      />
    </div>
  );
}
