import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RailEntityProvider } from "./_components/rail/RailEntityContext";
import GlobalSearch from "./_components/search/GlobalSearch";
import { ReedLauncherProvider } from "./_components/reed/ReedLauncherProvider";
import AdminPWA from "./_components/AdminPWA";
import { AdminUserProvider } from "./_components/AdminUserContext";
import { AdminBadgesProvider } from "./_components/AdminBadges";
import V2Sidebar from "./_components/v2/V2Sidebar";
import V2TabZone from "./_components/v2/V2TabZone";
import V2ReedEdge from "./_components/v2/V2ReedEdge";
import V2MobileBar from "./_components/v2/V2MobileBar";
import V2QuickAdd from "./_components/v2/V2QuickAdd";
import { getAdminUser, getOrgContext, getUserOrgs } from "@/lib/admin/auth";
import { getMyDisplayName } from "@/lib/admin/profile";
import { getEntitlements, hasFeature } from "@/lib/admin/entitlements";
import { getShellTermLabels } from "@/lib/admin/terminology";
import { resolveShellNav } from "@/lib/admin/v2shellNav";

export const metadata: Metadata = {
  title: {
    // absolute: escape the marketing site's "%s | Ambition Angels" template —
    // a shared multi-tenant host must not carry tenant-one's name in its title.
    absolute: "BloomOS",
    template: "%s · BloomOS",
  },
  description: "BloomOS — the operating system for your nonprofit.",
  // Override the root layout's AA-branded social metadata for the same reason.
  openGraph: {
    title: "BloomOS",
    siteName: "BloomOS",
    description: "BloomOS — the operating system for your nonprofit.",
    images: [],
  },
  twitter: {
    title: "BloomOS",
    description: "BloomOS — the operating system for your nonprofit.",
    images: [],
  },
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

  // The signed-in person's real name for the sidebar footer — the legacy
  // remi/shannon handle (`user`) is a display fallback only, so a second-tenant
  // owner isn't shown as "Remi". Their role comes from the org membership.
  const displayName = authed ? await getMyDisplayName() : null;

  // One request-cached entitlement read feeds the whole shell: the Reed FAB
  // gate, the sidebar's module filter, and the mobile dock — plus every
  // module-layout FeatureGate rendered below shares the same query.
  // `features` is null pre-auth so the login screen keeps the full IA (B2
  // de-AAs the pre-auth shell).
  const ents = authed && orgId ? await getEntitlements(orgId) : null;
  const features = ents ? Array.from(ents) : null;

  // Reed is gated by the `ai.reed` entitlement (Grow and up). On Bloom
  // base the FAB simply doesn't mount — and /api/reed/* will 402 server-side
  // (Phase 4), so hiding it here is an affordance, not the security boundary.
  const reedEnabled = !!ents && hasFeature(ents, "ai.reed");

  // The user's orgs feed the sidebar-footer switcher (C1) — it only renders
  // with 2+ memberships, so single-org users never see it.
  const orgs = authed ? await getUserOrgs() : [];

  // ── The V2 shell (Spec B, B3) — the ONLY chrome since the V1 retirement
  // (Spec Inbox X2 cut the last destination over; the per-user
  // profiles.v2_shell flag and the V1 chrome branch were deleted with
  // NAV_SECTIONS, Spec B's named cleanup). Pre-auth renders the bare login
  // surface below — the V1 sidebar that used to frame it is gone.
  if (authed) {
    // B4: the shell resolves its labels through the V2 term map (an org's
    // own renames win; V2 names like People/Team are never clobbered by
    // generic registry nouns).
    const nav = resolveShellNav(features, await getShellTermLabels());
    return (
      <AdminUserProvider value={{ user, isOwner: ctx?.role === "owner" }}>
      <AdminBadgesProvider orgId={orgId} enabled={authed}>
      <div className="admin-shell min-h-screen lg:flex bg-ink text-ink-1">
        <AdminPWA />
        <V2Sidebar
          nav={nav}
          displayName={displayName}
          role={ctx?.role ?? null}
          orgName={ctx?.orgName ?? null}
          orgs={orgs}
          activeOrgId={orgId}
        />
        <ReedLauncherProvider enabled={reedEnabled}>
          <RailEntityProvider>
            {/* 52px right gutter at xl clears the Reed edge tab (spec). The
                V1 right rail deliberately does NOT mount in the V2 shell —
                its jobs consolidate into Today + the Reed panel. */}
            <main
              className={`admin-main flex-1 min-w-0 overflow-y-auto${reedEnabled ? " xl:pr-[52px]" : ""}`}
            >
              <V2TabZone nav={nav} />
              {children}
            </main>
          </RailEntityProvider>
          <V2ReedEdge />
          {/* B5: the V2 bottom bar — Today · Work · ＋ · Programs · More,
              derived from the same resolved nav as the sidebar. */}
          <V2MobileBar nav={nav} currentUser={user} reedEnabled={reedEnabled} />
          {/* B6: the shell-level Quick Add — capture, report-an-issue, and
              the search overlay, at every desktop width (V2 has no rail). */}
          <V2QuickAdd currentUser={user} reedEnabled={reedEnabled} />
        </ReedLauncherProvider>
        <GlobalSearch />
      </div>
      </AdminBadgesProvider>
      </AdminUserProvider>
    );
  }

  // Pre-auth: the bare login surface. The V1 chrome that used to frame it
  // (Sidebar, SectionSubNav, the rail, the V1 FABs) retired with
  // NAV_SECTIONS — the login screen is a self-contained full-page surface
  // and needs no shell around it.
  return (
    <AdminUserProvider value={{ user, isOwner: ctx?.role === "owner" }}>
    <AdminBadgesProvider orgId={orgId} enabled={authed}>
    <div className="admin-shell min-h-screen bg-ink text-ink-1">
      <AdminPWA />
      <main className="admin-main min-w-0">{children}</main>
    </div>
    </AdminBadgesProvider>
    </AdminUserProvider>
  );
}
