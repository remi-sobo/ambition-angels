"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import DonateButton from "@/components/DonateButton";
import AppDownloadLink from "@/components/AppDownloadLink";
import { pillClass } from "@/components/site/PillCTA";

const links = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/curriculum", label: "Careers" },
  { href: "/schools", label: "Schools & Programs" },
  { href: "/impact", label: "Impact" },
  { href: "/donate", label: "Donate" },
  { href: "/companies", label: "For Companies" },
  { href: "/coach", label: "Become a Coach" },
  { href: "/guides", label: "For Guides" },
  { href: "/students", label: "For Students" },
  { href: "/teens", label: "Career Games" },
  { href: "/about", label: "About" },
];

// Pages that already end on their own "what to do next" section.
const NO_BAND = new Set(["/", "/students"]);

const colHead = {
  fontFamily: "var(--font-heading)",
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "var(--cream)",
  margin: "0 0 20px",
};

export default function SiteFooter() {
  const pathname = usePathname() ?? "";
  const showBand = !NO_BAND.has(pathname);

  return (
    <footer className="aa-footer" style={{ background: "var(--ink)", color: "var(--cream)" }}>
      {showBand && (
        <div style={{ background: "var(--orange)", textAlign: "center", padding: "clamp(64px,7vw,80px) clamp(20px,4vw,32px)" }}>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fff", margin: "0 0 12px" }}>
            Join the Movement
          </p>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "clamp(30px,3.6vw,40px)", color: "#fff", lineHeight: 1.2, margin: "0 auto 16px", maxWidth: 760, textWrap: "balance" }}>
            Help every young person explore careers before they have to choose one.
          </h2>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "#fff", margin: "0 0 32px" }}>
            Give, coach, or open a door to a school or company.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "12px 28px" }}>
            <DonateButton className={pillClass("inverse", "lg")}>Become an Angel</DonateButton>
            <Link href="/coach" className="aa-footer__band-link">
              Become a coach →
            </Link>
            <Link href="/schools#start" className="aa-footer__band-link">
              Bring Ambition to your students →
            </Link>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(56px,7vw,80px) clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 48 }}>
        <div>
          <Link href="/" style={{ display: "inline-block", marginBottom: 24 }}>
            <Image src="/images/logo-white.png" alt="Ambition Angels" width={202} height={88} style={{ height: 88, width: "auto", display: "block" }} />
          </Link>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.65, color: "var(--gray-mid)", maxWidth: 320, margin: 0 }}>
            Every young person should be able to see what is possible for them and know how to get there. That is the whole job.
          </p>
          <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
            <a href="https://www.linkedin.com/company/ambition-angels" target="_blank" rel="noopener noreferrer" className="aa-footer__link">
              LinkedIn
            </a>
            <a href="https://www.youtube.com/@ambitionangels" target="_blank" rel="noopener noreferrer" className="aa-footer__link">
              YouTube
            </a>
          </div>
        </div>
        <div>
          <h3 style={colHead}>Navigate</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 24px" }}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="aa-footer__link">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h3 style={colHead}>Get in Touch</h3>
          <p style={{ margin: "0 0 8px" }}>
            <a href="mailto:hello@ambitionangels.org" className="aa-footer__link">
              hello@ambitionangels.org
            </a>
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--gray-mid)", margin: 0 }}>380 Portage Ave, Palo Alto, CA 94306</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, alignItems: "flex-start" }}>
            <AppDownloadLink platform="ios" className="aa-footer__link aa-footer__strong">
              Download for iOS →
            </AppDownloadLink>
            <AppDownloadLink platform="android" className="aa-footer__link aa-footer__strong">
              Download for Android →
            </AppDownloadLink>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", borderTop: "1px solid rgb(250 250 248 / 0.1)", padding: "24px clamp(20px,4vw,32px)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--gray-mid)", margin: 0 }}>
          © {new Date().getFullYear()} Ambition Angels Inc. · US 501(c)(3) · EIN 87-2513010
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--gray-mid)", margin: 0 }}>
          The career exposure layer for every school and program serving young people.
        </p>
      </div>
    </footer>
  );
}
