import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";

/**
 * Update the signed-in user's display name (BloomOS account settings).
 *
 * Writes through the cookie-backed session client, so the profiles RLS
 * ("write own profile") guarantees a user can only change their own row.
 */
export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";

  if (!displayName) {
    return NextResponse.json({ error: "Enter a name" }, { status: 400 });
  }
  if (displayName.length > 80) {
    return NextResponse.json({ error: "Name must be 80 characters or fewer" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: ctx.userId, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) {
    console.error("Profile update failed:", error.message);
    return NextResponse.json({ error: "Couldn't save your name" }, { status: 500 });
  }

  await audit(req, {
    action: "account.profile_update",
    entityType: "profile",
    entityId: ctx.userId,
    after: { display_name: displayName },
  });
  return NextResponse.json({ ok: true, displayName });
}
