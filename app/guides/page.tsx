/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import AppDownloadLink from "@/components/AppDownloadLink";
import NumberedBlock from "@/components/site/NumberedBlock";
import PillCTA from "@/components/site/PillCTA";
import ScreenAddGuide from "@/components/site/screens/ScreenAddGuide";
import ScreenGuideDashboard from "@/components/site/screens/ScreenGuideDashboard";

export const metadata: Metadata = {
  title: "For Guides",
  description:
    "A guide is any adult in a young person's corner. Ambition shows you what they're exploring and gives you something real to talk about.",
};

const cards = [
  { t: "Who's moving and who stalled.", b: "At a glance." },
  { t: "Prompts, not homework.", b: "Questions tied to their actual work. No curriculum to learn." },
  { t: "The quiet ones find you.", b: "A nudge you can send in one click." },
];

export default function GuidesPage() {
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "48px", right: "6%", width: "130px", opacity: "0.2", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(88px,11vw,144px) clamp(20px,4vw,32px) clamp(80px,9vw,112px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>For Guides</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,7.4vw,92px)", lineHeight: "0.95", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px", maxWidth: "980px" }}>
              {"The career conversation, "}
              <span style={{ color: "var(--orange)" }}>ready before you sit down.</span>
            </h1>
            <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "640px", margin: "0 0 36px", textWrap: "pretty" }}>{"A guide is any adult in a young person's corner. Teacher, mentor, coach, counselor, program leader, parent. Ambition shows you what they're exploring and gives you something real to talk about."}</p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <PillCTA size="lg" href="#one">Become a guide</PillCTA>
              <PillCTA size="lg" variant="ghostDark" href="#dashboard">See the dashboard</PillCTA>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 40px" }}>How it works</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "40px" }}>
              <NumberedBlock number="01" title="They add you.">A student adds you as a guide in the app, or you join through their school or program.</NumberedBlock>
              <NumberedBlock number="02" title="You see their work.">Which careers they explored, how far they went, and what they said about each one.</NumberedBlock>
              <NumberedBlock number="03" title="You talk.">A prompt tied to the introship they just finished, so the conversation starts with something real.</NumberedBlock>
            </div>
          </div>
        </section>
        <section id="dashboard" style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "680px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>The dashboard</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0", color: "var(--ink)" }}>Built for adults who are already busy.</h2>
            </div>
            <div style={{ maxWidth: "1080px", margin: "0 auto 56px" }}>
              <ScreenGuideDashboard withPhone={true} caption="" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "24px" }}>
              {cards.map((c, i) => (
                <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card-lg)", padding: "28px" }}>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "18px", color: "var(--ink)", margin: "0 0 8px" }}>{c.t}</h3>
                  <p style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--muted)", margin: "0" }}>{c.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(88px,10vw,128px) 0", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-70.png" alt="" aria-hidden="true" style={{ position: "absolute", left: "4%", bottom: "32px", width: "200px", opacity: "0.2", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(32px,5vw,64px)", alignItems: "end" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Why it matters</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(48px,6vw,80px)", lineHeight: "0.95", margin: "0", color: "var(--cream)" }}>
                {"The adult is what "}
                <span style={{ color: "var(--orange)" }}>makes it stick.</span>
              </h2>
            </div>
            <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0", textWrap: "pretty" }}>{"The young people whose outlook changes are almost always connected to an adult who knows what they're doing. You don't need to be a career expert. You need to ask a good question at the right time. We handle the question."}</p>
          </div>
        </section>
        <section id="one" style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>One student or a small group?</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>{"You don't need a building to do this."}</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0 0 32px" }}>Parents and mentors use Ambition with one young person or a handful. The student downloads the app and adds you as their guide. Free.</p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <AppDownloadLink platform="ios" className="aa-pill aa-pill--primary">App Store</AppDownloadLink>
                <AppDownloadLink platform="android" className="aa-pill aa-pill--secondary">Google Play</AppDownloadLink>
              </div>
            </div>
            <ScreenAddGuide />
          </div>
        </section>
      </div>
    </>
  );
}
