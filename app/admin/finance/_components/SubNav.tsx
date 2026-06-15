"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent section nav for /admin/finance/*. Lives in the section layout
// so it stays put as you move between Dashboard / Upload / Transactions /
// Budget / Pledges / Rules / Config — and highlights the active tab so you
// always know where you are.
const LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin/finance", label: "Dashboard" },
  { href: "/admin/finance/model", label: "Model" },
  { href: "/admin/finance/upload", label: "Upload" },
  { href: "/admin/finance/transactions", label: "Transactions" },
  { href: "/admin/finance/budget", label: "Budget" },
  { href: "/admin/finance/revenue", label: "Pledges" },
  { href: "/admin/finance/rules", label: "Rules" },
  { href: "/admin/finance/config", label: "Config" },
];

// Exact match for the section root (so Dashboard isn't always lit), prefix
// match for nested pages so the chip stays highlighted on sub-routes like
// /admin/finance/budget/import.
function isActive(path: string, href: string): boolean {
  if (href === "/admin/finance") return path === "/admin/finance";
  return path === href || path.startsWith(href + "/");
}

export default function SubNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex items-center gap-1.5 text-xs flex-wrap">
      {LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-full border transition-colors ${
              active
                ? "border-orange/60 bg-orange/15 text-orange"
                : "border-outline text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
