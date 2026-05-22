import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Sidebar from "./_components/Sidebar";
import QuickAddButton from "./_components/QuickAddButton";
import AdminPWA from "./_components/AdminPWA";
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

export const metadata: Metadata = {
  title: {
    default: "AA Admin",
    template: "%s · AA Admin",
  },
  description: "Ambition Angels operating system.",
  manifest: "/admin/manifest.webmanifest",
  applicationName: "AA Admin",
  appleWebApp: {
    capable: true,
    title: "AA Admin",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/admin/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/admin/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/admin/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // The marketing site sets its own indexable metadata at the root layout;
  // the admin section should never appear in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0E0E0E",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover lets us reach into the iOS safe-area insets so the
  // dark shell paints behind the home indicator / notch when installed.
  viewportFit: "cover",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { authed, user } = readAdminAuth();

  // The shell (sidebar + main column) renders on every /admin/* visit,
  // including the unauthed login screen at /admin. Earlier this layout
  // skipped the shell when unauthed — but that meant logged-in users
  // briefly saw the page without a sidebar during the /admin client-side
  // auth flash, and the login form looked detached from the admin UI.
  // The Sidebar component already handles currentUser={null} gracefully.
  // The floating QuickAddButton is still gated on authed since its
  // actions all require a valid session.
  return (
    <div className="admin-shell min-h-screen lg:flex bg-ink text-cream">
      <AdminPWA />
      <Sidebar currentUser={user} />
      <main className="admin-main flex-1 min-w-0 overflow-y-auto">{children}</main>
      {authed && <QuickAddButton currentUser={user} />}
    </div>
  );
}
