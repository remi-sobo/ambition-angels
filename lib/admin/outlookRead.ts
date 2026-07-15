import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { loadRevenueSchedule } from "@/lib/finance/schedule";
import { getActionQueue } from "@/lib/admin/actionQueue";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { FINANCE, TASKS } from "@/lib/admin/thresholds";
import { buildOutlook, type Outlook } from "./outlook";

/**
 * The impure half of Status & Outlook (spec #5): load the four canonical
 * sources and hand them to the pure buildOutlook. Nothing here computes —
 * finance comes from the same snapshot the status line reads, inflows from
 * the same revenue schedule the runway tiers eat (security_invoker view via
 * the session client), deadlines from the queue, trends from the catalog.
 * One number, one owner, one definition.
 */
export const getOutlook = cache(async (): Promise<Outlook | null> => {
  try {
    const supabase = createServerSupabase();
    const [finance, schedule, queue, catalog] = await Promise.all([
      getFinanceSnapshot(),
      loadRevenueSchedule(supabase),
      getActionQueue(),
      getMetricCatalog(),
    ]);

    return buildOutlook(
      {
        todayISO: new Date().toISOString().slice(0, 10),
        cashOnHand: finance.cashOnHand,
        monthlyBurn: finance.burn3mo ?? null,
        inflows: schedule.map((r) => ({
          due_date: r.due_date,
          gross_amount: r.gross_amount,
          confidence: r.confidence,
          restricted: r.restricted,
        })),
        queueItems: queue.map((it) => ({ dueDate: it.dueDate, module: it.module })),
        metrics: catalog
          .filter((m) => m.active)
          .map((m) => ({
            metric_key: m.metric_key,
            name: m.name,
            target: m.target,
            direction: m.direction,
            history: m.history,
          })),
      },
      { cashFloorUsd: FINANCE.cashFloorUsd, dueCriticalCount: TASKS.overdueCriticalCount },
    );
  } catch (e) {
    console.error("[outlook] build failed:", e instanceof Error ? e.message : e);
    return null; // never let the outlook break the Command Center
  }
});
