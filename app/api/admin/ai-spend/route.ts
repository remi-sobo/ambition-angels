import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { spendSummary } from "@/lib/ai/ledger";

// Per-org AI spend for the current month, from the unified ai_calls ledger
// (supabase/migrations/create_ai_calls_ledger.sql): a total plus a per-surface
// breakdown. Read-only and RLS-scoped via the session client, so a member only
// ever sees their own org's spend.
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServerSupabase();
  return NextResponse.json(await spendSummary(supabase, ctx.orgId));
}
