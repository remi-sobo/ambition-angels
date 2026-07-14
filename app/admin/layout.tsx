import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Sidebar from "./_components/Sidebar";
import QuickAddButton from "./_components/QuickAddButton";
import Rail from "./_components/rail/Rail";
import { RailEntityProvider } from "./_components/rail/RailEntityContext";
import AskReedButton from "./_components/AskReedButton";
import GlobalSearch from "./_components/search/GlobalSearch";
import MobileTabBar from "./_components/MobileTabBar";
import { ReedLauncherProvider } from "./_components/reed/ReedLauncherProvider";
import AdminPWA from "./_components/AdminPWA";
import { AdminUserProvider } from "./_components/AdminUserContext";
import { AdminBadgesProvider } from "./_components/AdminBadges";
import { getAdminUser, getOrgContext } from "@/lib/admin/auth";
import { hasEntitlement } from "@/lib/admin/entitlements";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: {
    default: "BloomOS",
    template: "%s · BloomOS",
  },
  description: "BloomOS — the operating system for your nonprofit.",
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
  const [user, ctx] = await Promise.all([getAdminUser(), getOrgContext()]);
  const authed = user !== null;
  const orgId = ctx?.orgId ?? null;

  // Reed is gated by the `ai.reed` entitlement (Bloom Grow and up). On Bloom
  // base the FAB simply doesn't mount — and /api/reed/* will 402 server-side
  // (Phase 4), so hiding it here is an affordance, not the security boundary.
  const reedEnabled = authed && (await hasEntitlement("ai.reed"));

  // Per-tenant label for the Staff module (Phase 4 org_terminology), so the nav
  // reads "Team"/"People" when an org has renamed it. Falls back to "Staff".
  let staffLabel: string | null = null;
  if (orgId) {
    const { data } = await createServerSupabase()
      .from("org_terminology")
      .select("label")
      .eq("org_id", orgId)
      .eq("term_key", "staff")
      .maybeSingle();
    staffLabel = (data as { label: string } | null)?.label ?? null;
  }

  // The shell (sidebar + main column) renders on every /admin/* visit,
  // including the unauthed login screen at /admin. Earlier this layout
  // skipped the shell when unauthed — but that meant logged-in users
  // briefly saw the page without a sidebar during the /admin client-side
  // auth flash, and the login form looked detached from the admin UI.
  // The Sidebar component already handles currentUser={null} gracefully.
  // The floating QuickAddButton is still gated on authed since its
  // actions all require a valid session.
  return (
    <AdminUserProvider value={user}>
    <AdminBadgesProvider orgId={orgId} enabled={authed}>
    <div className="admin-shell min-h-screen lg:flex bg-ink text-ink-1">
      <AdminPWA />
      <Sidebar currentUser={user} staffLabel={staffLabel} orgName={ctx?.orgName ?? null} />
      {/* One Reed launcher shared by the rail (desktop capture-to-Reed) and the
          FAB (mobile), so there's a single Reed drawer regardless of entry. */}
      <ReedLauncherProvider enabled={reedEnabled}>
        <RailEntityProvider>
          <main className="admin-main flex-1 min-w-0 overflow-y-auto">{children}</main>
          {authed && <Rail reedEnabled={reedEnabled} />}
        </RailEntityProvider>
        {/* lg–xl tablets: the rail only mounts at xl, so the standalone FABs
            still carry Reed + quick-add there. Phones get the unified tab bar
            below instead (so the two FABs don't collide on small screens). */}
        {reedEnabled && <AskReedButton />}
        {authed && <MobileTabBar currentUser={user} reedEnabled={reedEnabled} />}
      </ReedLauncherProvider>
      {authed && <QuickAddButton currentUser={user} />}
      {authed && <GlobalSearch />}
    </div>
    </AdminBadgesProvider>
    </AdminUserProvider>
  );
}
