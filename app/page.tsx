/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import HeroCarousel from "@/components/site/HeroCarousel";
import PillCTA from "@/components/site/PillCTA";
import ScreenGuideDashboard from "@/components/site/screens/ScreenGuideDashboard";
import ScreenIntroship from "@/components/site/screens/ScreenIntroship";
import { STATS } from "@/lib/stats";

const steps = [
  { n: "01", t: "Pick a career.", b: "Students choose from 50 careers, from nursing and firefighting to game design and wealth management." },
  { n: "02", t: "Complete an introship.", b: "8 to 10 minutes on what the job is, what people do all day, and what it pays." },
  { n: "03", t: "Talk with a guide.", b: "Their teacher or mentor gets a question tied to that career, so the conversation starts with something real." },
];

const featured = [
  { name: "Registered Nurse", img: "/images/site/illus/registered-nurse-future.webp", href: "/curriculum/nursing" },
  { name: "Software Engineer", img: "/images/site/illus/software-engineer-future.webp", href: "/curriculum/software-engineering" },
  { name: "Chef", img: "/images/site/illus/chef-future.webp", href: "/curriculum/culinary-arts" },
].map((c) => ({ ...c, alt: "A student as a future " + c.name.toLowerCase() }));

const adults = [
  { t: "A live dashboard.", b: "Every student, the career they're exploring, and who needs a check-in." },
  { t: "Progress at a glance.", b: "Participation across a class, a cohort, or a whole site." },
  { t: "Conversation prompts.", b: "A question tied to the exact introship each student just finished." },
];

const stats = [
  { v: STATS.teensReached.value, l: "young people reached" },
  { v: STATS.titleI.value, l: "come from Title I schools" },
  { v: STATS.futureOrientation.value, l: "more students taking real steps toward a career" },
];

export default function Home() {  return (
    <>
      <div className="aa-page aa-home" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ background: "var(--cream)", overflow: "hidden" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "var(--hero-pad)", display: "grid", gridTemplateColumns: "var(--hero-cols)", gap: "clamp(32px,4vw,64px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>For schools and youth programs</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", letterSpacing: "-0.015em", fontSize: "clamp(52px,6.4vw,104px)", lineHeight: "0.88", color: "var(--ink)", margin: "0 0 24px" }}>
                {"Career exposure students can "}
                <span style={{ color: "var(--orange)" }}>actually use.</span>
              </h1>
              <p style={{ fontSize: "clamp(17px,1.4vw,19px)", lineHeight: "1.6", color: "var(--charcoal)", margin: "0 0 32px", maxWidth: "520px", textWrap: "pretty" }}>Students explore careers through introships, 8 to 10 minute looks inside real jobs built with the professionals who do them. Then their teachers, mentors, and program staff get a prompt to turn what they explored into a real conversation.</p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <PillCTA size="lg" href="/schools#start">Bring Ambition to your students</PillCTA>
                <Link className="hv-189c7d" href="/curriculum" style={{ display: "inline-flex", alignItems: "center", minHeight: "52px", padding: "0 28px", borderRadius: "999px", border: "1.5px solid var(--ink)", color: "var(--ink)", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px" }}>Explore careers</Link>
              </div>
            </div>
            <HeroCarousel />
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(64px,8vw,104px) 0" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(20px,4vw,48px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 14px" }}>How it works</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--ink)", margin: "0 0 clamp(32px,4vw,48px)" }}>From a career to a conversation.</h2>
            <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "clamp(16px,2vw,24px)" }}>
              {steps.map((s, i) => (
                <li key={i} style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "clamp(24px,3vw,32px)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "48px", lineHeight: "0.9", color: "var(--orange)", marginBottom: "14px" }}>{s.n}</div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "21px", color: "var(--ink)", margin: "0 0 8px" }}>{s.t}</h3>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0" }}>{s.b}</p>
                </li>
              ))}
            </ol>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "16px", lineHeight: "1.5", color: "var(--muted)", margin: "28px 0 0" }}>
              {"When a career clicks, students can go deeper: a 30-day internship, Life Lessons on the skills every job needs, or an Ambition Coach who does the work. "}
              <Link href="/how-it-works" style={{ fontWeight: "600", whiteSpace: "nowrap" }}>See how it works →</Link>
            </p>
          </div>
        </section>
        <section style={{ background: "var(--ink)", padding: "clamp(64px,8vw,104px) 0" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(20px,4vw,48px)", display: "grid", gridTemplateColumns: "var(--split-cols)", gap: "clamp(32px,5vw,72px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 14px" }}>What students see</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--cream)", margin: "0 0 18px" }}>A real career in 8 to 10 minutes.</h2>
              <p style={{ fontSize: "17px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0 0 28px", maxWidth: "460px" }}>What the job is, what a day looks like, and what it pays. On a school computer during class, or on their phone anywhere else.</p>
              <Link href="/curriculum" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "inline-flex", alignItems: "center", minHeight: "44px" }}>Explore all 50 careers →</Link>
            </div>
            <div style={{ minWidth: "0" }}>
              <ScreenIntroship device="laptop" onDark={true} caption="" />
            </div>
          </div>
          <div className="aa-hide-phone" style={{ maxWidth: "1240px", margin: "clamp(48px,6vw,72px) auto 0", padding: "0 clamp(20px,4vw,48px)" }}>
            <ul aria-label="Featured careers" style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "20px" }}>
              {featured.map((c, i) => (
                <li key={i} style={{ background: "rgb(250 250 248 / 0.05)", border: "1px solid rgb(250 250 248 / 0.12)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
                  <Link className="hv-7ccd06" href={c.href} style={{ display: "block", color: "var(--cream)" }}>
                    <img src={c.img} alt={c.alt} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block", background: "rgb(253 245 234)" }} />
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "16px 18px" }}>
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "17px" }}>{c.name}</span>
                      <span aria-hidden="true" style={{ color: "var(--orange)" }}>→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section style={{ background: "var(--cream)", padding: "clamp(64px,8vw,104px) 0" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(20px,4vw,48px)" }}>
            <div style={{ maxWidth: "640px", marginBottom: "clamp(32px,4vw,48px)" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 14px" }}>What adults get</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--ink)", margin: "0 0 16px" }}>Something real to talk about.</h2>
              <p style={{ fontSize: "17px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0" }}>{"Any adult in a student's corner can be their guide. No curriculum to learn, and nobody from Ambition needs to be in the room."}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "var(--adult-cols)", gap: "clamp(32px,4vw,56px)", alignItems: "center" }}>
              <div className="aa-hide-phone" style={{ minWidth: "0" }}>
                <ScreenGuideDashboard caption="" />
              </div>
              <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
                {adults.map((a, i) => (
                  <li key={i} style={{ padding: "20px 0", borderTop: "1px solid var(--rule)" }}>
                    <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", color: "var(--ink)", margin: "0 0 6px" }}>{a.t}</h3>
                    <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0" }}>{a.b}</p>
                  </li>
                ))}
                <li style={{ paddingTop: "20px", borderTop: "1px solid var(--rule)" }}>
                  <Link href="/schools" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "inline-flex", alignItems: "center", minHeight: "44px" }}>For schools and programs →</Link>
                </li>
              </ul>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(64px,8vw,104px) 0", borderTop: "1px solid var(--rule)" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(20px,4vw,48px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 14px" }}>Impact</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--ink)", margin: "0 0 clamp(32px,4vw,48px)" }}>{"What we've seen so far."}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "clamp(24px,3vw,40px)" }}>
              {stats.map((s, i) => (
                <div key={i} style={{ paddingTop: "20px", borderTop: "3px solid var(--orange)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(64px,6vw,96px)", lineHeight: "0.9", color: "var(--ink)" }}>{s.v}</div>
                  <p style={{ fontSize: "17px", lineHeight: "1.5", color: "var(--charcoal)", margin: "10px 0 0", maxWidth: "280px" }}>{s.l}</p>
                </div>
              ))}
            </div>
            <Link href="/impact" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "inline-flex", alignItems: "center", minHeight: "44px", marginTop: "28px" }}>See the full results →</Link>
          </div>
        </section>
        <section style={{ background: "var(--ink)", padding: "clamp(64px,8vw,104px) 0" }}>
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 clamp(20px,4vw,48px)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--cream)", margin: "0 0 clamp(28px,4vw,40px)" }}>Where do you fit?</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "16px" }}>
              <Link className="hv-c0790c" href="/schools#start" style={{ background: "var(--orange)", color: "var(--ink)", borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,36px)", display: "flex", flexDirection: "column", gap: "12px", minHeight: "200px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase" }}>Schools + programs</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", lineHeight: "1.25" }}>Bring Ambition to your students.</span>
                <span style={{ marginTop: "auto", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px" }}>Talk to us →</span>
              </Link>
              <Link className="hv-2d679a" href="/students" style={{ background: "rgb(250 250 248 / 0.06)", border: "1px solid rgb(250 250 248 / 0.16)", color: "var(--cream)", borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,36px)", display: "flex", flexDirection: "column", gap: "12px", minHeight: "200px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gray-mid)" }}>Students</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", lineHeight: "1.25" }}>{"Start exploring careers. It's free."}</span>
                <span style={{ marginTop: "auto", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--orange)" }}>Get the app →</span>
              </Link>
              <Link className="hv-2d679a" href="/donate" style={{ background: "rgb(250 250 248 / 0.06)", border: "1px solid rgb(250 250 248 / 0.16)", color: "var(--cream)", borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,36px)", display: "flex", flexDirection: "column", gap: "12px", minHeight: "200px" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gray-mid)" }}>Supporters</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", lineHeight: "1.25" }}>{"Help more students see what's possible."}</span>
                <span style={{ marginTop: "auto", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--orange)" }}>Donate →</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
