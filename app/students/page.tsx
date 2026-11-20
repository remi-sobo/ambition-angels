/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import AppDownloadLink from "@/components/AppDownloadLink";
import ScreenAddGuide from "@/components/site/screens/ScreenAddGuide";
import ScreenIntroship from "@/components/site/screens/ScreenIntroship";

export const metadata: Metadata = {
  title: "For Students",
  description:
    "Try on real careers in 8 to 10 minutes. Nursing, game design, firefighting, wealth management, and a lot more. Free for every student.",
};

const levels = [
  { n: "01", level: "8 to 10 minutes", title: "Pick a career.", body: "See what the job is and what it pays." },
  { n: "02", level: "Keep exploring", title: "Try another.", body: "Then the next one. See what's out there." },
  { n: "03", level: "When one clicks", title: "Go deeper.", body: "Take the full internship for that career." },
];

export default function StudentsPage() {
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "32px", left: "24px", width: "120px", opacity: "0.25", transform: "rotate(-12deg)", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(72px,9vw,112px) clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: "clamp(48px,6vw,80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>For Students</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(60px,9vw,112px)", lineHeight: "0.92", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px" }}>
                {"See what's "}
                <span style={{ color: "var(--orange)" }}>out there.</span>
              </h1>
              <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "480px", margin: "0 0 36px", textWrap: "pretty" }}>Try on real careers in 8 to 10 minutes. Nursing, game design, firefighting, wealth management, and a lot more. Free.</p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <AppDownloadLink platform="ios" className="aa-pill aa-pill--primary aa-pill--lg">App Store</AppDownloadLink>
                <AppDownloadLink platform="android" className="aa-pill aa-pill--ghostDark aa-pill--lg">Google Play</AppDownloadLink>
              </div>
            </div>
            <ScreenIntroship device="phone" onDark={true} />
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 40px" }}>How it works</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "24px" }}>
              {levels.map((lv, i) => (
                <div key={i} className="hv-1aad61" style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "32px 28px", transition: "transform .25s cubic-bezier(0.22,1,0.36,1), box-shadow .25s, border-color .25s" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "96px", lineHeight: "0.9", color: "var(--orange)", marginBottom: "20px" }}>{lv.n}</div>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" }}>{lv.level}</p>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", color: "var(--ink)", margin: "0 0 10px" }}>{lv.title}</h3>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0" }}>{lv.body}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px 32px", marginTop: "40px", paddingTop: "28px", borderTop: "1px solid var(--rule)" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", lineHeight: "1.5", color: "var(--ink)", margin: "0", maxWidth: "640px" }}>Found one you love? Take the full internship, or ask for a coach who does the job for real.</p>
              <Link href="/how-it-works" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "inline-flex", alignItems: "center", minHeight: "44px" }}>See how it works →</Link>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Bring your people</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>Add the adults in your corner.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>{"Add a teacher, coach, mentor, or anyone who has your back as your guide. They'll see what you're exploring and help you figure out what's next."}</p>
            </div>
            <ScreenAddGuide />
          </div>
        </section>
      </div>
    </>
  );
}
