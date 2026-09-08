import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getFinanceSnapshot } from "@/lib/admin/finance";
import { getForecast } from "@/lib/admin/overview/sources";
import { getStrategyGlance } from "@/lib/admin/plan/glance";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { METRIC_RESOLVERS } from "@/lib/admin/metrics/resolvers";
import { HEALTH_RANK } from "@/lib/admin/plan/health";
import {
  composeFreshness,
  composeFundraising,
  composeGovernance,
  composeMoney,
  composePrograms,
  composeStrategy,
  composeTeam,
  type HealthVerdict,
} from "@/lib/admin/orgHealthCompose";

/**
 * Spec Home, stage H2 — Organization Health's data spine. Seven rows, each
 * bound to a CANONICAL source (Contract 1: one function per number — this
 * loader computes nothing the platform already computes):
 *
 *   money        → getFinanceSnapshot            (gate modules.finance)
 *   fundraising  → getForecast                   (gate modules.fundraising)
 *   programs     → METRIC_RESOLVERS.attendance_rate — the one house formula
 *                                                (gate modules.program)
 *   team         → ops_tasks weekly counts, session client
 *                                                (gate modules.staff)
 *   strategy     → getStrategyGlance's own deterministic line
 *                                                (gate modules.strategy)
 *   governance   → compliance_items + board_members, session client
 *                                                (gate board OR compliance)
 *   freshness    → getMetricCatalog's stale/unresolved flags
 *                                                (gate modules.metrics)
 *
 * Rows are entitlement-gated INDIVIDUALLY (recon §D.3: the 9-key orgs render
 * 5 of 7 — strategy and team drop). An ungated row is never computed.
 */

export type HealthRow = HealthVerdict & { key: string; label: string };

export const getOrgHealth = cache(async (): Promise<HealthRow[] | null> => {
  const ctx = await getOrgContext();
  if (!ctx) return null;
  const ents = await getEntitlements(ctx.orgId);
  const supabase = createServerSupabase();
  const admin = getSupabaseAdmin();
  const todayISO = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const rows: HealthRow[] = [];
  const push = (key: string, label: string, v: HealthVerdict) => rows.push({ key, label, ...v });

  if (hasFeature(ents, "modules.finance")) {
    const fin = await getFinanceSnapshot();
    const anchorDate = fin.cfg.reconciledAt?.slice(0, 10) ?? null;
    const anchorStale =
      !fin.cfg.reconciledAt ||
      Date.now() - new Date(fin.cfg.reconciledAt).getTime() > 4 * 86400000;
    push("money", "Money", composeMoney({
      runwayMonths: fin.runwayMonths,
      cashOnHand: fin.cashOnHand,
      burn3mo: fin.burn3mo,
      anchorStale,
      anchorDate,
    }));
  }

  if (hasFeature(ents, "modules.fundraising")) {
    const f = await getForecast();
    push("fundraising", "Fundraising", composeFundraising(f));
  }

  if (hasFeature(ents, "modules.program")) {
    // The A6 resolver IS the house attendance formula — org-fenced inside.
    const pct = await METRIC_RESOLVERS.attendance_rate(admin, ctx.orgId);
    push("programs", "Programs", composePrograms({ attendancePct: pct }));
  }

  if (hasFeature(ents, "modules.staff")) {
    const [doneRes, overdueRes] = await Promise.all([
      supabase
        .from("ops_tasks")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("status", "done")
        .gte("completed_at", weekAgo),
      supabase
        .from("ops_tasks")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .neq("status", "done")
        .is("archived_at", null)
        .lt("due_date", todayISO)
        .or(`snoozed_until.is.null,snoozed_until.lte.${todayISO}`),
    ]);
    push("team", "Team execution", composeTeam({
      doneThisWeek: doneRes.count ?? 0,
      overdueOpen: overdueRes.count ?? 0,
    }));
  }

  if (hasFeature(ents, "modules.strategy")) {
    const glance = await getStrategyGlance();
    const worstHealth = glance.objectives.reduce<string | null>(
      (worst, o) =>
        worst === null || (HEALTH_RANK[o.health] ?? 0) > (HEALTH_RANK[worst] ?? 0)
          ? o.health
          : worst,
      null,
    );
    push("strategy", "Strategy", composeStrategy({
      hasPlan: glance.hasPlan,
      statusLine: glance.statusLine,
      worstHealth,
    }));
  }

  if (hasFeature(ents, "modules.board") || hasFeature(ents, "modules.compliance")) {
    const [boardRes, overdueRes, nextRes] = await Promise.all([
      supabase
        .from("board_members")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId),
      supabase
        .from("compliance_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .in("status", ["upcoming", "in_progress"])
        .lt("due_date", todayISO),
      supabase
        .from("compliance_items")
        .select("title, due_date")
        .eq("org_id", ctx.orgId)
        .in("status", ["upcoming", "in_progress"])
        .gte("due_date", todayISO)
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    push("governance", "Governance", composeGovernance({
      boardMembers: boardRes.count ?? 0,
      overdueFilings: overdueRes.count ?? 0,
      nextDue: nextRes.data
        ? { title: nextRes.data.title as string, due: nextRes.data.due_date as string }
        : null,
      todayISO,
    }));
  }

  if (hasFeature(ents, "modules.metrics")) {
    const catalog = await getMetricCatalog();
    const active = catalog.filter((m) => m.active);
    push("freshness", "Data freshness", composeFreshness({
      activeMetrics: active.length,
      staleMetrics: active.filter((m) => m.stale).length,
      unresolved: active.filter((m) => m.unresolved).length,
    }));
  }

  return rows;
});
