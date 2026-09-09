import { getFinanceSnapshot } from "@/lib/admin/finance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadRevenueSchedule } from "@/lib/finance/schedule";
import PageHeader from "../../_components/PageHeader";
import ForecastBoard, { type SeedLever } from "./_components/ForecastBoard";
import ModelSection from "../model/ModelSection";
import RevenueSection from "../revenue/RevenueSection";
import PledgesSection from "../../fundraising/pledges/PledgesSection";

// Forecast / scenario planning. Starts from the canonical cash + burn and lets
// the CEO stack levers (a hire, a grant landing, a campaign) to see when cash
// runs out under each scenario. Seeded from the canonical revenue schedule so it
// opens informed. No new tables — the scenario lives client-side (a scenario
// STORE is deliberately deferred: Spec Finance decision 1, signed).
//
// Spec Finance N2 — the one forward surface. Below the scenario board,
// Forecast absorbs its three tributaries as embedded sections: the founder
// Model cards (aa.finance_model only — the section fences itself), the
// year's Revenue tiers (received / committed / projected), and the
// pledges-due tier. Same components the V1 /model, /revenue, and
// /fundraising/pledges routes render standalone until their N4 308s. The
// tier dedup rules stay owned by the schedule migrations — this page
// composes, never re-derives.
export const dynamic = "force-dynamic";

export default async function FinanceForecastPage({
  searchParams,
}: {
  searchParams?: { year?: string };
}) {
  const snap = await getFinanceSnapshot();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Seed income levers from the revenue schedule — every dated future inflow
  // (pledges, awarded grants, weighted pipeline, manual). Committed lands at
  // full value; projected pipeline is already probability-weighted in the view,
  // so a 50%-likely ask seeds at half, not as guaranteed cash.
  const schedule = await loadRevenueSchedule(sb, snap.orgId);
  const seeds: SeedLever[] = schedule
    .filter((r) => r.due_date >= today)
    .map((r) => ({
      label: r.label || "Expected inflow",
      amount: Math.round(r.confidence === "committed" ? r.gross_amount : r.weighted_amount),
      date: r.due_date,
      status: r.confidence === "committed" ? "secured" : "projected",
    }))
    .filter((s) => s.amount > 0 && !!s.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 30);

  return (
    <div className="max-w-7xl px-4 lg:px-8 py-6 lg:py-8 space-y-8">
      <div className="max-w-5xl space-y-6">
        <PageHeader
          eyebrow="Scenario planning"
          title="Forecast"
          subtitle="Project cash forward and stack what-ifs — a hire, a grant landing, a slip — to see when you run out under each scenario."
        />
        <ModelSection embedded />
        <ForecastBoard cashOnHand={snap.cashOnHand} monthlyBurn={snap.burn3mo} seeds={seeds} />
      </div>

      <RevenueSection
        searchParams={searchParams ?? {}}
        embedded
        basePath="/admin/finance/forecast"
      />
      <PledgesSection embedded />
    </div>
  );
}
