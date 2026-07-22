"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent section nav for /admin/meetings/* (same pattern as Finance's
// SubNav). One sidebar item — "Meetings" — fans out here: the meeting records
// home, the connection backlog, incoming bookings, and the public booking
// page's setup. Lives in the section layout so the tabs persist across
// navigation and the active pill always matches the route.
const LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin/meetings", label: "Overview" },
  { href: "/admin/meetings/connections", label: "Connections" },
  { href: "/admin/meetings/bookings", label: "Bookings" },
  { href: "/admin/meetings/booking-page", label: "Booking page" },
];

// Overview owns every route in the section that no other tab claims — meeting
// record details (/admin/meetings/<id>) and upcoming-event pages included —
// so drilling into a record keeps you oriented instead of dropping the
// highlight entirely.
function isActive(path: string, href: string): boolean {
  if (href === "/admin/meetings") {
    return (
      (path === href || path.startsWith(href + "/")) &&
      !LINKS.slice(1).some((l) => path === l.href || path.startsWith(l.href + "/"))
    );
  }
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
