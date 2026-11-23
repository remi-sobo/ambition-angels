import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { checkFactorRemoval } from "@/lib/auth/twoStep";
import { audit } from "@/lib/audit";

/**
 * Settings → Your account → Two-step login: remove one of YOUR authenticators.
 *
 * Runs on the session client only: Supabase Auth unenrolls a factor for the
 * signed-in user, and only at aal2 (middleware already demands aal2 for this
 * path). The rule (lib/auth/twoStep.ts checkFactorRemoval) refuses the last
 * verified factor, because two-step login is required for everyone.
 */
export async function DELETE(req: NextRequest, { params }: { params: { factorId: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    console.error("List factors failed:", error?.message);
    return NextResponse.json({ error: "Your authenticators couldn't be read. Try again." }, { status: 500 });
  }
  const rule = checkFactorRemoval(data.all, params.factorId);
  if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: rule.status });

  const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId: params.factorId });
  if (unenrollErr) {
    console.error("Unenroll failed:", unenrollErr.message);
    return NextResponse.json({ error: "That authenticator wasn't removed. Try again." }, { status: 500 });
  }

  await audit(req, {
    action: "auth.two_step.factor_removed",
    entityType: "auth",
    entityId: params.factorId,
  });
  return NextResponse.json({ ok: true });
}
