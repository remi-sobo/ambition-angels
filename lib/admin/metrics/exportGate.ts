import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * Spec A, stage A5 — the Contract 7 gating rule. Any export, send, approval,
 * or period close names the metric_keys its artifact references and asks this
 * gate; if any referenced definition carries confirmed_state 'conflict' or
 * 'stale' — or the key has NO definition at all — the action BLOCKS. A holder
 * of reports.approve may waive (POST /api/admin/export-waivers), which writes
 * an export_waivers row + audit_log entry; the waiver travels with the
 * artifact, and this gate subtracts it on the next check.
 *
 * Drafting is never blocked (Contract 7 rule 1): nothing here runs at render
 * time — the <Metric> primitive flags the same states inline (./render); this
 * module guards only the EXIT.
 *
 * computeGate is PURE; checkExportGate is the session-client wrapper
 * (metric_definitions and export_waivers reads both ride RLS — metrics.read /
 * reports.read — so the gate can never see, or leak, another org's rows).
 */

export type GateReason = "conflict" | "stale" | "undefined";
export type GateBlocker = { metricKey: string; reason: GateReason };

export type ExportGate = {
  /** True when at least one blocker is NOT covered by a waiver. */
  blocked: boolean;
  /** Blockers still standing (no waiver). Empty when the artifact may ship. */
  blockers: GateBlocker[];
  /** Blockers a reports.approve holder has waived for THIS artifact — the
   *  artifact ships, and these travel with it. */
  waived: GateBlocker[];
  /** confirmed_state='unconfirmed' keys — flagged to the user, never
   *  blocking, never needing a waiver. */
  unconfirmed: string[];
};

export function computeGate(
  defs: readonly { metric_key: string; confirmed_state: string | null }[],
  metricKeys: readonly string[],
  waivedKeys: ReadonlySet<string>,
): ExportGate {
  const byKey = new Map(defs.map((d) => [d.metric_key, d]));
  const blockers: GateBlocker[] = [];
  const waived: GateBlocker[] = [];
  const unconfirmed: string[] = [];

  // De-dup: an artifact naming a key twice gets one verdict for it.
  for (const key of Array.from(new Set(metricKeys))) {
    const def = byKey.get(key);
    const reason: GateReason | null = !def
      ? "undefined"
      : def.confirmed_state === "conflict" || def.confirmed_state === "stale"
        ? (def.confirmed_state as GateReason)
        : null;
    if (reason) {
      (waivedKeys.has(key) ? waived : blockers).push({ metricKey: key, reason });
    } else if (def?.confirmed_state === "unconfirmed") {
      unconfirmed.push(key);
    }
  }
  return { blocked: blockers.length > 0, blockers, waived, unconfirmed };
}

export type ExportWaiver = {
  id: string;
  artifact_type: string;
  artifact_id: string;
  metric_key: string | null;
  waived_by: string;
  waived_at: string;
  reason: string | null;
};

/** The waivers already written for one artifact (reports.read RLS). */
export async function getWaivers(
  artifactType: string,
  artifactId: string,
): Promise<ExportWaiver[]> {
  const ctx = await getOrgContext();
  if (!ctx) return [];
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("export_waivers")
    .select("id, artifact_type, artifact_id, metric_key, waived_by, waived_at, reason")
    .eq("org_id", ctx.orgId)
    .eq("artifact_type", artifactType)
    .eq("artifact_id", artifactId)
    .order("waived_at", { ascending: true });
  return (data ?? []) as ExportWaiver[];
}

/**
 * The gate a destination calls before shipping an artifact that references
 * metricKeys. Fail-closed: no session context, or a definitions read error,
 * blocks everything rather than shipping unchecked.
 */
export async function checkExportGate(
  artifactType: string,
  artifactId: string,
  metricKeys: readonly string[],
): Promise<ExportGate & { waivers: ExportWaiver[] }> {
  const failClosed = (): ExportGate & { waivers: ExportWaiver[] } => ({
    blocked: metricKeys.length > 0,
    blockers: Array.from(new Set(metricKeys)).map((metricKey) => ({
      metricKey,
      reason: "undefined" as const,
    })),
    waived: [],
    unconfirmed: [],
    waivers: [],
  });

  const ctx = await getOrgContext();
  if (!ctx) return failClosed();
  const supabase = createServerSupabase();

  const [{ data: defs, error }, waivers] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("metric_key, confirmed_state")
      .eq("org_id", ctx.orgId),
    getWaivers(artifactType, artifactId),
  ]);
  if (error) return failClosed();

  const waivedKeys = new Set(
    waivers.map((w) => w.metric_key).filter((k): k is string => k != null),
  );
  const gate = computeGate(
    (defs ?? []) as { metric_key: string; confirmed_state: string | null }[],
    metricKeys,
    waivedKeys,
  );
  return { ...gate, waivers };
}
