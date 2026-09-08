import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

// Spec B, stage B3 — flip the per-user V2 shell flag (profiles.v2_shell).
// SESSION client on purpose: the "write own profile" RLS policy is the
// authority, so a user can only ever flip their own flag. Until the
// spec_b_v2_shell_flag.sql migration is applied the update fails on the
// missing column and this answers with a plain explanation, never a 500
// stack — the flag can't break anything by shipping first.
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ v2_shell: body.enabled })
    .eq("user_id", ctx.userId);
  if (error) {
    const missing = /v2_shell/.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "The v2_shell column is not applied yet (supabase/migrations/spec_b_v2_shell_flag.sql). Everyone stays on V1 until it is."
          : error.message,
      },
      { status: missing ? 409 : 500 },
    );
  }

  await audit(req, {
    action: "shell.v2_toggled",
    entityType: "profile",
    entityId: ctx.userId,
    after: { v2_shell: body.enabled },
  });
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
