/**
 * Capture name matcher (specs/bloomos-capture.md, ruling 1 and C2 step 4).
 *
 * Session client ONLY. Each spoken span goes to the capture_match_candidates
 * RPC (supabase/migrations/capture_match_rpc.sql), a SECURITY INVOKER trigram
 * search over constituents, partners, and fr_prospects pinned to the caller's
 * active org. RLS applies on top, so a caller sees only rows they could open.
 * Students, applications, cohorts, attendance, and imports are never queried,
 * here or in the RPC.
 *
 * Never the row-creating constituent resolver in lib/fundraising, never the
 * global search route (it reads students). The context entity (the page Record was tapped on) is
 * injected as a candidate with a strong prior so the model can cite it even
 * when the note never says the name.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CANDIDATES_PER_SPAN, CONTEXT_PRIOR_SIM } from "./constants";
import type { Candidate, CandidateKind, ContextEntity } from "./types";

export const CAPTURE_MATCH_RPC = "capture_match_candidates";

type RpcRow = {
  id: string;
  kind: string;
  name: string | null;
  org_name: string | null;
  meta: string | null;
  sim: number | null;
};

const KINDS: readonly CandidateKind[] = ["constituent", "partner", "prospect"];

export type FindCandidatesResult = {
  candidates: Candidate[];
  /** span -> refs of the candidates it produced. */
  spanMap: Record<string, string[]>;
};

/**
 * Query the RPC per span, dedupe by (kind, id), keep the best similarity, and
 * hand back refs (c1, c2, ...) in similarity order. Pure after the RPC calls.
 */
export async function findCandidates(
  supabase: SupabaseClient,
  orgId: string,
  spans: string[],
  context: ContextEntity | null = null,
): Promise<FindCandidatesResult> {
  // Distinct spans, case-insensitively (pg_trgm ignores case), first spelling kept.
  const seenSpan = new Set<string>();
  const cleanSpans = spans
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .filter((s) => {
      const k = s.toLowerCase();
      if (seenSpan.has(k)) return false;
      seenSpan.add(k);
      return true;
    });

  const perSpan = await Promise.all(
    cleanSpans.map(async (span) => {
      const { data, error } = await supabase.rpc(CAPTURE_MATCH_RPC, {
        q: span,
        org: orgId,
        lim: CANDIDATES_PER_SPAN,
      });
      if (error) {
        console.error("[capture/match] rpc failed:", (error as { message?: string }).message);
        return { span, rows: [] as RpcRow[] };
      }
      return { span, rows: (data ?? []) as RpcRow[] };
    }),
  );

  // Merge: key by kind+id, keep max sim, collect spans.
  const merged = new Map<string, Omit<Candidate, "ref">>();
  for (const { span, rows } of perSpan) {
    for (const row of rows) {
      if (!KINDS.includes(row.kind as CandidateKind)) continue;
      const key = `${row.kind}:${row.id}`;
      const sim = Math.max(0, Math.min(1, Number(row.sim ?? 0)));
      const existing = merged.get(key);
      if (existing) {
        existing.sim = Math.max(existing.sim, sim);
        if (!existing.spans.includes(span)) existing.spans.push(span);
      } else {
        merged.set(key, {
          kind: row.kind as CandidateKind,
          id: row.id,
          name: (row.name ?? "").trim() || "(unnamed)",
          orgName: row.org_name?.trim() || null,
          meta: row.meta?.trim() || null,
          sim,
          spans: [span],
          context: false,
        });
      }
    }
  }

  // Context prior: the entity the capture started from.
  if (context) {
    const key = `${context.type}:${context.id}`;
    const existing = merged.get(key);
    if (existing) {
      existing.sim = Math.max(existing.sim, CONTEXT_PRIOR_SIM);
      existing.context = true;
    } else {
      merged.set(key, {
        kind: context.type,
        id: context.id,
        name: context.name,
        orgName: context.orgName,
        meta: context.meta,
        sim: CONTEXT_PRIOR_SIM,
        spans: [],
        context: true,
      });
    }
  }

  const ordered = Array.from(merged.values()).sort(
    (a, b) => b.sim - a.sim || Number(b.context) - Number(a.context) || a.name.localeCompare(b.name),
  );
  const candidates: Candidate[] = ordered.map((c, i) => ({ ref: `c${i + 1}`, ...c }));

  const spanMap: Record<string, string[]> = {};
  for (const span of cleanSpans) {
    spanMap[span] = candidates.filter((c) => c.spans.includes(span)).map((c) => c.ref);
  }
  return { candidates, spanMap };
}
