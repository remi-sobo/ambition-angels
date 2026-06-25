import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Sidebar from "./_components/Sidebar";
import QuickAddButton from "./_components/QuickAddButton";
import Rail from "./_components/rail/Rail";
import { RailEntityProvider } from "./_components/rail/RailEntityContext";
import AdminPWA from "./_components/AdminPWA";
import { getAdminUser } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: {
    default: "BloomOS",
    template: "%s · BloomOS",
  },
  description: "BloomOS — operating system for Ambition Angels.",
  manifest: "/admin/manifest.webmanifest",
  applicationName: "BloomOS",
  appleWebApp: {
    capable: true,
    title: "BloomOS",
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
  themeColor: "#23160D",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover lets us reach into the iOS safe-area insets so the
  // dark shell paints behind the home indicator / notch when installed.
  viewportFit: "cover",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Supabase-session-backed check (valid session + org membership).
  const user = await getAdminUser();
  const authed = user !== null;

  // The shell (sidebar + main column) renders on every /admin/* visit,
  // including the unauthed login screen at /admin. Earlier this layout
  // skipped the shell when unauthed — but that meant logged-in users
  // briefly saw the page without a sidebar during the /admin client-side
  // auth flash, and the login form looked detached from the admin UI.
  // The Sidebar component already handles currentUser={null} gracefully.
  // The floating QuickAddButton is still gated on authed since its
  // actions all require a valid session.
  return (
    <div className="admin-shell min-h-screen lg:flex bg-ink text-ink-1">
      <AdminPWA />
      <Sidebar currentUser={user} />
      <RailEntityProvider>
        <main className="admin-main flex-1 min-w-0 overflow-y-auto">{children}</main>
        {authed && <Rail />}
      </RailEntityProvider>
      {authed && <QuickAddButton currentUser={user} />}
    </div>
  );
}
