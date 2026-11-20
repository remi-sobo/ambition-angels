"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import PillCTA from "@/components/site/PillCTA";

// Five jobs in the bar. Companies, Guides, Students and About live in the
// footer (and under the fold of the phone menu) so the bar stays readable.
const primary = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/curriculum", label: "Careers" },
  { href: "/schools", label: "Schools & Programs" },
  { href: "/impact", label: "Impact" },
  { href: "/donate", label: "Donate" },
];
const secondary = [
  { href: "/companies", label: "For Companies" },
  { href: "/guides", label: "For Guides" },
  { href: "/students", label: "For Students" },
  { href: "/about", label: "About" },
];

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="aa-header">
      <div className="aa-header__bar">
        <Link href="/" className="aa-header__logo" aria-label="Ambition Angels home">
          <Image src="/images/logo-color.png" alt="Ambition Angels" width={200} height={87} priority />
        </Link>
        <nav className="aa-header__nav" aria-label="Main">
          {primary.map((l) => (
            <Link key={l.href} href={l.href} className="aa-header__link" aria-current={isOn(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="aa-header__cta">
          <PillCTA size="sm" href="/schools#start">
            Talk to us
          </PillCTA>
        </div>
        <button
          type="button"
          className="aa-header__toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {menuOpen && (
        <nav className="aa-header__menu" aria-label="Menu" onClick={() => setMenuOpen(false)}>
          {primary.map((l) => (
            <Link key={l.href} href={l.href} className="aa-header__link" aria-current={isOn(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <div className="aa-header__menu-secondary" style={{ display: "flex", flexDirection: "column" }}>
            {secondary.map((l) => (
              <Link key={l.href} href={l.href} className="aa-header__link" aria-current={isOn(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <PillCTA href="/schools#start">Talk to us</PillCTA>
          </div>
        </nav>
      )}
    </header>
  );
}
