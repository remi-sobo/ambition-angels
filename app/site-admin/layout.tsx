import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getSiteAdmin } from "@/lib/site/adminAuth";
import ConfirmProvider from "@/app/admin/_components/feedback/ConfirmProvider";
import SignIn from "./SignIn";
import SignOutButton from "./SignOutButton";

// The Ambition Angels website admin (specs/bloomos-repo-split.md §6d), served
// at ambitionangels.org/admin. Website work only: careers, games, site
// numbers, form delivery. People, money and programs live in BloomOS. If a
// request is unclear, it goes to BloomOS. This admin stays small on purpose.

export const metadata: Metadata = {
  title: "Website admin · Ambition Angels",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Home" },
  { href: "/admin/careers", label: "Careers" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/forms", label: "Forms" },
];

export default async function SiteAdminLayout({ children }: { children: ReactNode }) {
  const admin = await getSiteAdmin();
  if (!admin) return <SignIn />;

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-cream text-ink">
        <header className="border-b border-gray-light bg-white">
          <div className="max-w-6xl mx-auto px-4 lg:px-8 h-14 flex items-center gap-6">
            <span className="font-heading font-semibold text-sm">Website admin</span>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-charcoal hover:text-orange transition-colors">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-warm">
              <a href="https://app.bloomos.org/admin" className="hover:text-orange">
                Go to BloomOS ↗
              </a>
              <span>{admin.email}</span>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto">{children}</main>
      </div>
    </ConfirmProvider>
  );
}
