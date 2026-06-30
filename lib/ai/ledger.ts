/**
 * Unified AI spend ledger (lib/ai + supabase/migrations/create_ai_calls_ledger.sql).
 *
 * One append-only row per model call, across every surface, so per-org spend is
 * readable in one place. This sits BESIDE the existing per-agent logs
 * (reed_activity_log, fr_agent_activity_log), which keep working unchanged; the
 * ledger is written additively so nothing here can break a call it records.
 *
 * `logAICall` is fire-and-forget (never throws). `monthToDateSpendUsd` is the
 * read the per-org cap and the spend view use; it returns 0 on any error so a
 * read hiccup never blocks a call.
 *
 * Call both with a client authorized for the org (the RLS-scoped session client,
 * or the service-role client) so the append/read passes RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AICallStatus = "success" | "partial" | "failed";

export type AICallRecord = {
  orgId: string;
  /** 'reed' | 'funder_research' | 'briefing' | 'acknowledgment' | ... */
  surface: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  triggeredBy?: string | null;
  status?: AICallStatus;
  metadata?: Record<string, unknown>;
};

/** First instant of the current UTC month, as an ISO string (the cap window). */
export function startOfUtcMonth(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Append one row to the unified ledger. Never throws. */
export async function logAICall(supabase: SupabaseClient, rec: AICallRecord): Promise<void> {
  try {
    const { error } = await supabase.from("ai_calls").insert({
      org_id: rec.orgId,
      surface: rec.surface,
      triggered_by: rec.triggeredBy ?? null,
      model_used: rec.model,
      tokens_input: Math.max(0, Math.round(rec.tokensInput || 0)),
      tokens_output: Math.max(0, Math.round(rec.tokensOutput || 0)),
      cost_usd: Number((rec.costUsd || 0).toFixed(6)),
      status: rec.status ?? "success",
      metadata: rec.metadata ?? {},
    });
    if (error) console.error("[ai/ledger] logAICall failed:", (error as { message?: string }).message);
  } catch (e) {
    console.error("[ai/ledger] logAICall threw:", e instanceof Error ? e.message : e);
  }
}

/**
 * Month-to-date AI spend (USD) for an org, optionally narrowed to one surface.
 * Returns 0 on any error.
 */
export async function monthToDateSpendUsd(
  supabase: SupabaseClient,
  orgId: string,
  surface?: string,
): Promise<number> {
  try {
    let query = supabase
      .from("ai_calls")
      .select("cost_usd")
      .eq("org_id", orgId)
      .gte("created_at", startOfUtcMonth());
    if (surface) query = query.eq("surface", surface);
    const { data, error } = (await query) as { data: { cost_usd: number | null }[] | null; error: unknown };
    if (error) {
      console.error("[ai/ledger] mtd read failed:", (error as { message?: string }).message);
      return 0;
    }
    return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
  } catch (e) {
    console.error("[ai/ledger] mtd threw:", e instanceof Error ? e.message : e);
    return 0;
  }
}

export type SurfaceSpend = { surface: string; costUsd: number; calls: number };
export type SpendSummary = {
  monthStart: string;
  totalUsd: number;
  bySurface: SurfaceSpend[];
};

/**
 * Month-to-date spend for an org, broken down per surface (highest first).
 * The per-org spend view reads this. Returns an empty summary on any error so a
 * read failure renders an empty card rather than throwing.
 */
export async function spendSummary(supabase: SupabaseClient, orgId: string): Promise<SpendSummary> {
  const monthStart = startOfUtcMonth();
  const empty: SpendSummary = { monthStart, totalUsd: 0, bySurface: [] };
  try {
    const { data, error } = (await supabase
      .from("ai_calls")
      .select("surface, cost_usd")
      .eq("org_id", orgId)
      .gte("created_at", monthStart)) as {
      data: { surface: string | null; cost_usd: number | null }[] | null;
      error: unknown;
    };
    if (error) {
      console.error("[ai/ledger] spendSummary read failed:", (error as { message?: string }).message);
      return empty;
    }
    const bySurface = new Map<string, SurfaceSpend>();
    let totalUsd = 0;
    for (const row of data ?? []) {
      const surface = row.surface ?? "other";
      const cost = Number(row.cost_usd ?? 0);
      totalUsd += cost;
      const acc = bySurface.get(surface) ?? { surface, costUsd: 0, calls: 0 };
      acc.costUsd += cost;
      acc.calls += 1;
      bySurface.set(surface, acc);
    }
    return {
      monthStart,
      totalUsd,
      bySurface: Array.from(bySurface.values()).sort((a, b) => b.costUsd - a.costUsd),
    };
  } catch (e) {
    console.error("[ai/ledger] spendSummary threw:", e instanceof Error ? e.message : e);
    return empty;
  }
}
