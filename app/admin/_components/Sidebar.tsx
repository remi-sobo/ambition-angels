"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminUser } from "@/lib/admin/auth";

type NavLink = { href: string; label: string };

const NAV_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/fundraising", label: "Fundraising" },
  { href: "/admin/ops", label: "Ops" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/board", label: "Board" },
  { href: "/admin/compliance", label: "Compliance" },
  { href: "/admin/program", label: "Program" },
];

/**
 * Active when the path matches the link exactly, or is a descendant of it.
 * Special-cased for `/admin` so Dashboard isn't permanently active when
 * viewing nested routes.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Sidebar({
  currentUser,
}: {
  currentUser: AdminUser | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Even if the request fails, the cookie deletion is the source of
      // truth; the user can re-try by reloading. Don't block the redirect.
    }
    router.push("/admin");
    router.refresh();
  };

  return (
    <aside className="w-64 shrink-0 border-r border-white/10 bg-black/30 flex flex-col">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="font-display font-black text-lg uppercase tracking-tight text-cream">
          AA Admin
        </div>
        <div className="text-[11px] uppercase tracking-wider text-gray-mid mt-0.5">
          Operating System
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={[
                "block px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-orange/15 text-orange border border-orange/30"
                  : "text-cream/70 hover:text-cream hover:bg-white/5 border border-transparent",
              ].join(" ")}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 space-y-3">
        <div className="text-xs text-gray-mid">
          {currentUser
            ? `Logged in as ${capitalize(currentUser)}`
            : "Logged in"}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full text-xs font-semibold text-cream/60 hover:text-cream bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
