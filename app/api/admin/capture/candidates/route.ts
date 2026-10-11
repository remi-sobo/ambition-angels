import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { CANDIDATE_TYPEAHEAD_LIMIT } from "@/lib/capture/constants";
import { CAPTURE_MATCH_RPC } from "@/lib/capture/match";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/capture/candidates?q=&kind= (specs/bloomos-capture.md, C3 step 7).
 *
 * The "pick a match" typeahead for a held card. Wraps the same invoker RPC the
 * parse uses, pinned to the caller's active org, and returns constituents and
 * partners only: a prospect can't receive a filing, so it is never offered
 * here. Never the global search route, which reads students.
 */

type Row = { id: string; kind: string; name: string | null; org_name: string | null; meta: string | null; sim: number | null };
const KINDS = ["constituent", "partner"] as const;

export async function GET(req: NextRequest) {
  const ent = await requireEntitlement("ai.capture");
  if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== null && !KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "kind must be constituent or partner" }, { status: 400 });
  }
  if (q.length > 120) return NextResponse.json({ error: "q is too long" }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ candidates: [] });

  const supabase = createServerSupabase();
  // Over-fetch so dropping prospects (and the other kind) still fills the list.
  const { data, error } = await supabase.rpc(CAPTURE_MATCH_RPC, {
    q,
    org: ent.ctx.orgId,
    lim: CANDIDATE_TYPEAHEAD_LIMIT * 2,
  });
  if (error) {
    console.error("[capture/candidates] rpc failed:", (error as { message?: string }).message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
  const candidates = ((data ?? []) as Row[])
    .filter((r) => (kind ? r.kind === kind : KINDS.includes(r.kind as (typeof KINDS)[number])))
    .slice(0, CANDIDATE_TYPEAHEAD_LIMIT)
    .map((r) => ({
      kind: r.kind,
      id: r.id,
      name: (r.name ?? "").trim() || "(unnamed)",
      org_name: r.org_name?.trim() || null,
      meta: r.meta?.trim() || null,
    }));
  return NextResponse.json({ candidates });
}
