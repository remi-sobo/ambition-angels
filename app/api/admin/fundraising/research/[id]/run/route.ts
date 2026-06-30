import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrgContext } from "@/lib/admin/auth";

/**
 * GET /api/admin/fundraising/research/[prospect_id]/run
 *
 * Latest research run for a prospect, for the BriefPanel to poll. Read through
 * the session client so RLS (fundraising.read) scopes it to the org.
 *
 * Staleness guard: the background task lives at most maxDuration (300s). A run
 * still 'running' well past that means the function died without recording an
 * outcome — report (and persist) it as failed so the UI never hangs forever.
 */
export const dynamic = "force-dynamic";

const STALE_MS = 6 * 60 * 1000; // a touch beyond maxDuration (300s)

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("research_runs")
    .select("id, status, error, brief_id, created_at, finished_at")
    .eq("prospect_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[research/run GET] error:", error.message);
    return NextResponse.json({ error: "Failed to load run" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ run: null });

  const row = data as {
    id: string;
    status: string;
    error: string | null;
    brief_id: string | null;
    created_at: string;
    finished_at: string | null;
  };

  let status = row.status;
  let errMsg = row.error;
  if (status === "running" && Date.now() - new Date(row.created_at).getTime() > STALE_MS) {
    status = "failed";
    errMsg = errMsg ?? "Run timed out.";
    // Persist the transition so it sticks (service role; RLS-exempt).
    await getSupabaseAdmin()
      .from("research_runs")
      .update({ status: "failed", error: errMsg, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "running");
  }

  return NextResponse.json({
    run: {
      id: row.id,
      status,
      error: errMsg,
      briefId: row.brief_id,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    },
  });
}
