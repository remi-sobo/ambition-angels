"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/the-app", label: "The App" },
  { href: "/curriculum", label: "Curriculum" },
  { href: "/impact", label: "Impact" },
  { href: "/for-adults", label: "For Adults" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
          scrolled || menuOpen
            ? "bg-cream/95 backdrop-blur-md border-b border-gray-light shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="container-site">
          <div className="flex items-center justify-between h-16 lg:h-18">

            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src={scrolled || menuOpen ? "/images/logo-color.png" : "/images/logo-white.png"}
                alt="Ambition Angels"
                width={200}
                height={60}
                className="h-9 w-auto"
                priority
              />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "text-orange"
                      : "text-charcoal hover:text-orange"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center gap-3">
              <Link
                href="/donate"
                className="bg-orange text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-orange-dark transition-colors min-h-[44px] inline-flex items-center"
              >
                Donate
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden flex flex-col items-center justify-center gap-1.5 p-3 -mr-3 min-h-[44px] min-w-[44px]"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span className={`block w-6 h-0.5 transition-all duration-200 ${scrolled || menuOpen ? "bg-ink" : "bg-cream"} ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-6 h-0.5 transition-all duration-200 ${scrolled || menuOpen ? "bg-ink" : "bg-cream"} ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-6 h-0.5 transition-all duration-200 ${scrolled || menuOpen ? "bg-ink" : "bg-cream"} ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute top-16 left-0 right-0 bg-cream border-b border-gray-light shadow-lg">
            <nav className="container-site py-6 flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-base font-medium py-3 border-b border-gray-light last:border-0 transition-colors ${
                    pathname === link.href ? "text-orange" : "text-charcoal"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/donate"
                onClick={() => setMenuOpen(false)}
                className="mt-4 bg-orange text-white text-base font-semibold px-6 py-3.5 rounded-full text-center hover:bg-orange-dark transition-colors"
              >
                Donate
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
