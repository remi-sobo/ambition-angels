import Link from "next/link";

// Sub-navigation strip that appears below the page header on the finance
// dashboard. Server component — no active state highlighting since this is
// only rendered on /admin/finance itself; individual pages have their own
// "← Finance" breadcrumb instead.
const LINKS: Array<{ href: string; label: string; primary?: boolean }> = [
  { href: "/admin/finance/upload", label: "Upload CSV", primary: true },
  { href: "/admin/finance/transactions", label: "Transactions" },
  { href: "/admin/finance/budget", label: "Budget" },
  { href: "/admin/finance/revenue", label: "Pledges" },
  { href: "/admin/finance/rules", label: "Rules" },
  { href: "/admin/finance/config", label: "Config" },
];

export default function SubNav() {
  return (
    <nav className="flex items-center gap-2 text-xs flex-wrap">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-1.5 rounded-full border transition-colors ${
            l.primary
              ? "border-orange/40 bg-orange/15 text-orange hover:bg-orange/25"
              : "border-white/10 text-cream/70 hover:text-cream hover:bg-white/5"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
