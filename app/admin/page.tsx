import { getOrgContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import LoginScreen from "./_components/LoginScreen";
import CommandCenter from "./_components/CommandCenter";

// /admin is the Command Center (Overview in the BloomOS sidebar). Unauthed
// visitors get the login screen in the same slot — middleware deliberately
// leaves /admin itself ungated so this page can host both states. The
// previous client-side dashboard lives on at /admin/legacy until its tables
// move into their module pages.
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
  return <CommandCenter />;
}
