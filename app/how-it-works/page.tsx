/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import AppDownloadLink from "@/components/AppDownloadLink";
import NumberedBlock from "@/components/site/NumberedBlock";
import PillCTA from "@/components/site/PillCTA";
import StatBar from "@/components/site/StatBar";
import ScreenAddGuide from "@/components/site/screens/ScreenAddGuide";
import ScreenAdmin from "@/components/site/screens/ScreenAdmin";
import ScreenGuideDashboard from "@/components/site/screens/ScreenGuideDashboard";
import ScreenIntroship from "@/components/site/screens/ScreenIntroship";
import { STATS } from "@/lib/stats";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Short career experiences built with real professionals. On the web during class or program time, on the phone everywhere else, with the adults in the room seeing every step.",
};

const four = [
  { n: "01", t: "The roster.", b: "Every student, the career they're exploring, how many they've tried, and their last activity: on track, making progress, or needs a check-in." },
  { n: "02", t: "The spotlight.", b: "One student at a time. Which careers they've explored, how deep they went, and what they said about each one." },
  { n: "03", t: "The prompts.", b: "Conversation questions tied to the exact introship a student just finished. Ready before you sit down." },
  { n: "04", t: "The follow-ups.", b: "Students who went quiet surface at the top of your week, with a note you can send in one click." },
];

const stats = [
  STATS.teensReached,
  STATS.titleI,
  { value: STATS.futureOrientation.value, label: "Increase in teens taking real steps toward a career" },
  { value: STATS.hoursDelivered.value, label: "Hours of career exploration" },
];

export default function HowItWorksPage() {
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "40px", right: "6%", width: "130px", opacity: "0.2", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(88px,11vw,144px) clamp(20px,4vw,32px) clamp(80px,9vw,112px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>The Ambition Platform</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(56px,8vw,96px)", lineHeight: "0.95", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px", maxWidth: "820px" }}>
              {"Where careers "}
              <span style={{ color: "var(--orange)" }}>get started.</span>
            </h1>
            <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "600px", margin: "0 0 36px", textWrap: "pretty" }}>Short career experiences built with real professionals. On the web during class or program time, on the phone everywhere else, with the adults in the room seeing every step.</p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <PillCTA size="lg" href="/schools">Bring Ambition to your students</PillCTA>
              <PillCTA size="lg" variant="ghostDark" href="/students">Get the app</PillCTA>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "640px", marginBottom: "56px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>The introship</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>Try a lot of careers. Find the one that clicks.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--muted)", margin: "0" }}>Every introship is a short look inside one career, built with people who do the job. Students try one, then another, and the list of careers they can picture keeps growing.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,5vw,64px)", alignItems: "center", paddingBottom: "56px", marginBottom: "56px", borderBottom: "1px solid var(--rule)" }}>
              <ScreenIntroship device="laptop" />
              <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "96px", lineHeight: "0.85", color: "var(--orange)", flexShrink: "0" }}>01</div>
                <div>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" }}>8 to 10 minutes</p>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "28px", letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 12px" }}>Look inside one career.</h3>
                  <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>What the job is, what a day looks like, what it pays, and how people get in.</p>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "40px" }}>
              <NumberedBlock number="02" title="Then try another.">Students pick the next career, and the next. Most careers are found, not planned, so the more they see, the better.</NumberedBlock>
              <NumberedBlock number="03" title="Go deeper when one clicks.">{"When a career sticks, there's somewhere to go next."}</NumberedBlock>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--cream)", borderTop: "1px solid var(--rule)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "680px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Going further</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>{"When a career clicks, there's somewhere to go next."}</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--muted)", margin: "0" }}>Introships are the main event. These are for the students who want more.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "40px" }}>
              <NumberedBlock number="01" title="Internships.">A month inside one career, about 15 minutes a day, with a fictional employer, a manager, and a real project to finish.</NumberedBlock>
              <NumberedBlock number="02" title="Life Lessons.">Short lessons on the skills every career needs: communication, problem-solving, and time management.</NumberedBlock>
              <NumberedBlock number="03" title="Ambition Coach.">Four conversations with a professional in the field a student wants to enter. They leave with a written Ambition Plan and a concrete next step.</NumberedBlock>
            </div>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", color: "var(--ink)", margin: "48px 0 0" }}>
              {"Ambition doesn't run the next step. Connection does. Coach is how we start that. "}
              <Link href="/companies#coach" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px" }}>Become a coach →</Link>
            </p>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Two screens, one account</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 56px", color: "var(--cream)", maxWidth: "820px", textWrap: "balance" }}>Fourth period on a Chromebook. After practice on their phone.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,5vw,64px)", alignItems: "center" }}>
              <ScreenIntroship device="both" onDark={true} />
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ background: "rgb(250 250 248 / 0.05)", border: "1px solid rgb(250 250 248 / 0.1)", borderRadius: "var(--radius-card-lg)", padding: "28px" }}>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 10px" }}>On the web</p>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--cream)", margin: "0 0 10px" }}>In class or program time.</h3>
                  <p style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0" }}>A school or program puts Ambition in front of every student in the room, on the computers they already use. The adult in the room watches progress while it happens.</p>
                </div>
                <div style={{ background: "rgb(250 250 248 / 0.05)", border: "1px solid rgb(250 250 248 / 0.1)", borderRadius: "var(--radius-card-lg)", padding: "28px" }}>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 10px" }}>On the phone</p>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--cream)", margin: "0 0 10px" }}>Everywhere else.</h3>
                  <p style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0" }}>{"The same student picks up the same career on the bus, at home, or after practice. Same account, same progress. It doesn't care which screen it's on."}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "680px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>The guide dashboard</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>They do the work. The adults see all of it.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--muted)", margin: "0" }}>Every guide gets a dashboard built around four things.</p>
            </div>
            <div style={{ maxWidth: "980px", margin: "0 auto 56px" }}>
              <ScreenGuideDashboard />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: "20px" }}>
              {four.map((f, i) => (
                <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card-lg)", padding: "28px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "40px", lineHeight: "1", color: "var(--orange)", marginBottom: "14px" }}>{f.n}</div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "18px", color: "var(--ink)", margin: "0 0 8px" }}>{f.t}</h3>
                  <p style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--muted)", margin: "0" }}>{f.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Adding a guide</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>Students choose their adults.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>In the app, a student can add any adult in their corner as a guide: a teacher, a mentor, a coach, a program leader. That adult gets the same dashboard.</p>
            </div>
            <ScreenAddGuide />
          </div>
        </section>
        <section style={{ background: "var(--cream)", borderTop: "1px solid var(--rule)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: "clamp(40px,6vw,72px)", alignItems: "center" }}>
            <div style={{ maxWidth: "460px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>For principals and program leaders</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>The whole picture, for whoever runs it.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>Assign introships to a class or cohort and set a goal. Then see participation across every class or site, which careers students are exploring, and which teachers and staff are active.</p>
            </div>
            <ScreenAdmin />
          </div>
        </section>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(32px,5vw,64px)", alignItems: "end", marginBottom: "72px" }}>
              <div>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>The outcome</p>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0", color: "var(--cream)", textWrap: "balance" }}>After a few careers, a student knows what fits.</h2>
              </div>
              <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0", textWrap: "pretty" }}>{"What the work feels like. What it pays. Whether they'd want to do it every day. Then they try something else, and they start seeing careers they didn't know existed. We call that future orientation: a young person's ability to picture a future they're excited about and take real steps toward it."}</p>
            </div>
            <div style={{ position: "relative", paddingTop: "48px", borderTop: "1px solid rgb(250 250 248 / 0.1)" }}>
              <img src="/images/site/doodles/doodle-70.png" alt="" aria-hidden="true" style={{ position: "absolute", right: "4%", top: "8px", width: "200px", opacity: "0.2", pointerEvents: "none" }} />
              <StatBar items={stats} />
            </div>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Not in a school or program?</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)", textWrap: "balance" }}>A student can download Ambition and start today.</h2>
            <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0 0 32px" }}>Free. Any adult in their corner can become their guide.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <AppDownloadLink platform="ios" className="aa-pill aa-pill--primary">App Store</AppDownloadLink>
              <AppDownloadLink platform="android" className="aa-pill aa-pill--primary">Google Play</AppDownloadLink>
              <PillCTA variant="secondary" href="/guides">Become a guide</PillCTA>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
