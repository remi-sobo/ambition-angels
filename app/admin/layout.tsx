import { cookies } from "next/headers";
import type { ReactNode } from "react";
import Sidebar from "./_components/Sidebar";
import type { AdminUser } from "@/lib/admin/auth";

/**
 * Server-side auth check for the admin shell.
 *
 * The shared helpers in `lib/admin/auth.ts` take a `NextRequest`, which App
 * Router server components don't have — they get `cookies()` from
 * `next/headers` instead. This is a thin local mirror of the same logic;
 * the canonical helpers stay where they are.
 */
function readAdminAuth(): { authed: boolean; user: AdminUser | null } {
  const cookieStore = cookies();
  const auth = cookieStore.get("admin_auth")?.value;
  if (!auth) return { authed: false, user: null };

  const accepted = [
    process.env.ADMIN_PASSWORD_REMI,
    process.env.ADMIN_PASSWORD_SHANNON,
    process.env.ADMIN_PASSWORD,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  const authed = accepted.includes(auth);
  if (!authed) return { authed: false, user: null };

  const userCookie = cookieStore.get("admin_user")?.value;
  if (userCookie === "remi" || userCookie === "shannon") {
    return { authed: true, user: userCookie };
  }
  // Legacy session (admin_auth set, admin_user not yet) — default to Remi.
  return { authed: true, user: "remi" };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { authed, user } = readAdminAuth();

  // Unauthed visitors only reach /admin in practice — `middleware.ts`
  // redirects /admin/* nested routes to /admin when no valid cookie is
  // present. /admin itself renders the monolith's password login UI; we
  // skip the shell so the login experience isn't framed by a sidebar
  // that's not yet usable.
  if (!authed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-ink text-cream">
      <Sidebar currentUser={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
