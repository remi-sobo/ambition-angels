import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import LoginScreen from "./_components/LoginScreen";

// /admin is the AUTH DOOR (Spec Home, H3): signed-in users are forwarded to
// Today; unauthed visitors get the login screen, byte-for-byte as before —
// middleware deliberately leaves /admin ungated so this page can host both
// states, and a config 308 can't branch on auth, which is why the forward
// lives here instead of next.config (the map row's note says the same).
// The V1 Command Center component stays on disk, unrouted, per the
// nothing-is-deleted rule.
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { auth_error?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    // Distinguish "no session" from "session without a membership" (e.g. a
    // Google account outside the allowlist) so the latter gets an explicit
    // dead-end message instead of silently looping back to the form.
    const {
      data: { user: sessionUser },
    } = await createServerSupabase().auth.getUser();
    return (
      <LoginScreen
        sessionEmail={sessionUser?.email ?? null}
        authError={searchParams?.auth_error === "1"}
      />
    );
  }
  redirect("/admin/today");
}
