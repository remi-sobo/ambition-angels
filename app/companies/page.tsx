/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import PageVisitedEvent from "@/components/PageVisitedEvent";
import PillCTA from "@/components/site/PillCTA";
import CompaniesContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "For Companies",
  description:
    "Put your people's careers in front of the next generation: introships built from their stories, sponsored schools and seasons, and coaching for young people who want to do what they do.",
};

const ways = [
  { n: "01", t: "Turn your careers into introships.", b: "Your employees share how they got where they are. We build introships from it, credited to your team, and put them in classrooms." },
  { n: "02", t: "Sponsor a season.", b: "Be the title sponsor of an Ambition season. A Student of the Season cohort, sponsored by your company, gets recognized and gets swag." },
  { n: "03", t: "Sponsor a school or program.", b: "Pick a place your company cares about. Every student there gets Ambition, and every adult who works with them gets the tools." },
  { n: "04", t: "Coach a young person.", b: "Your people spend about five hours, virtually, helping one young person get into the field they work in." },
].map((w, i) => ({ ...w, cta: i === 3 ? "Become a coach" : "Talk to us", href: i === 3 ? "#coach" : "#start", bg: i === 3 ? "var(--ink)" : "var(--paper)", border: i === 3 ? "var(--ink)" : "var(--rule)", head: i === 3 ? "var(--cream)" : "var(--ink)", body: i === 3 ? "var(--gray-mid)" : "var(--charcoal)" }));

const founding = { eyebrow: "Founding partner", name: "Twilio", body: "Five Twilio employees told us the ins and outs of their careers. We turned that into introships that thousands of young people will come into contact with." };

const takes = { eyebrow: "What it takes", h2: "One session. About 90 minutes.", body: "Your people join a video call and talk about the work they do. No prep and no travel. It fits inside a volunteer week or a team meeting. We handle the rest." };

const back = [
  { n: "01", t: "Your team's name on the careers they built.", b: "Every introship built from your people's stories is credited to your team." },
  { n: "02", t: "A volunteer event people can do from anywhere.", b: "One video session your employees can join from any office or from home." },
  { n: "03", t: "A year-end report.", b: "How many students explored the careers your team built." },
];

const coach = [
  { n: "1", t: "A 20-minute call with Remi.", b: "We learn about your work and match you with a young person who wants to do it." },
  { n: "2", t: "Four 45-minute conversations.", b: "Over six to eight weeks, on video. We send you a short card before each session." },
  { n: "3", t: "They write an Ambition Plan.", b: "The young person leaves with a written plan and concrete next steps. You don't write it." },
  { n: "4", t: "One introduction, if you can.", b: "At the end, connect them to one person who can help. That's the whole ask." },
];

const time = [["Call with Remi", "20 min"], ["Four sessions", "45 min each"], ["Prep before each", "about 15 min"], ["Total", "about 5 hours"]].map(([k, v], i) => ({ k, v, color: i === 3 ? "var(--cream)" : "var(--gray-mid)", weight: i === 3 ? 700 : 500 }));
const path = [["At 16, pictured", "Something else entirely"], ["First job", "Wherever they started"], ["Now", "The job they do today"]].map(([k, v], i) => ({ k, v, dot: i === 2 ? "var(--orange)" : "transparent", line: i === 2 ? "transparent" : "rgb(250 250 248 / 0.2)" }));
const parts = ["What the job is", "How they got here", "What it pays"];

export default function CompaniesPage() {  return (
    <>
      <PageVisitedEvent name="companies_page_visited" />
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-70.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "48px", right: "6%", width: "150px", opacity: "0.2", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(72px,9vw,128px) clamp(20px,4vw,32px) clamp(72px,8vw,104px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: "clamp(48px,6vw,80px)", alignItems: "center" }}>
            <div style={{ position: "relative", zIndex: "2" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>For Companies</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,6.4vw,88px)", lineHeight: "0.95", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px", maxWidth: "980px" }}>
                {"Your people's careers, "}
                <span style={{ color: "var(--orange)" }}>in front of the next generation.</span>
              </h1>
              <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "620px", margin: "0 0 36px", textWrap: "pretty" }}>Most young people meet a handful of careers before they have to choose one. Your employees can change that, through introships built from their stories and conversations with students who want to do what they do.</p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <PillCTA size="lg" href="#start">Talk to us</PillCTA>
                <PillCTA size="lg" variant="ghostDark" href="#coach">Become a coach</PillCTA>
              </div>
            </div>
            <figure role="img" aria-label="Sample: one employee's career path, turned into an introship card" style={{ margin: "0", position: "relative", display: "flex", flexDirection: "column" }}>
              <div style={{ width: "min(100%,400px)", background: "rgb(250 250 248 / 0.06)", border: "1px solid rgb(250 250 248 / 0.16)", borderRadius: "var(--radius-card-lg)", padding: "24px 26px 30px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                  <span aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "1.5px dashed rgb(250 250 248 / 0.35)", flexShrink: "0" }} />
                  <div>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "16px", color: "var(--cream)" }}>One of your people</div>
                    <div style={{ fontSize: "13px", color: "var(--gray-mid)" }}>Their real career path</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {path.map((p, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ width: "12px", height: "12px", borderRadius: "50%", marginTop: "4px", background: p.dot, border: "2px solid var(--orange)" }} />
                        <span style={{ flex: "1", width: "2px", background: p.line, minHeight: "18px" }} />
                      </div>
                      <div style={{ paddingBottom: "14px" }}>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gray-mid)" }}>{p.k}</div>
                        <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--cream)" }}>{p.v}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ alignSelf: "flex-end", width: "min(100%,380px)", marginTop: "-36px", position: "relative", background: "var(--cream)", borderRadius: "var(--radius-card-lg)", padding: "24px", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "14px" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 10px", borderRadius: "999px", background: "var(--orange-light)", color: "var(--orange-dark)" }}>Introship · 8 to 10 min</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "12px", color: "var(--muted)" }}>Built with your team</span>
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", letterSpacing: "-0.01em", lineHeight: "1.15", color: "var(--ink)", marginBottom: "4px" }}>Marketing Director</div>
                <div style={{ fontSize: "14px", color: "var(--charcoal)", marginBottom: "16px" }}>Told by someone on your team who does it every day.</div>
                <div style={{ display: "flex", flexDirection: "column", marginBottom: "18px" }}>
                  {parts.map((pt, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "10px 0", borderTop: "1px solid var(--rule)", fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "14px", color: "var(--ink)" }}>
                      <span>{pt}</span>
                      <span aria-hidden="true" style={{ color: "var(--orange)" }}>→</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: "44px", borderRadius: "999px", background: "var(--orange)", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>Start</div>
              </div>
            </figure>
          </div>
        </section>
        <section aria-label="Founding partner" style={{ background: "var(--paper)", borderBottom: "1px solid var(--rule)", padding: "clamp(28px,3.5vw,40px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px clamp(32px,5vw,64px)" }}>
            <div style={{ flexShrink: "0" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 6px" }}>{founding.eyebrow}</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "28px", letterSpacing: "-0.01em", lineHeight: "1.1", color: "var(--ink)", margin: "0" }}>{founding.name}</p>
            </div>
            <p style={{ flex: "1 1 320px", maxWidth: "640px", fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0", textWrap: "pretty" }}>{founding.body}</p>
          </div>
        </section>
        <section style={{ background: "var(--cream)", padding: "clamp(64px,7vw,96px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(24px,5vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>{takes.eyebrow}</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", color: "var(--ink)", margin: "0" }}>{takes.h2}</h2>
            </div>
            <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0", textWrap: "pretty" }}>{takes.body}</p>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "700px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Ways to partner</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0", color: "var(--ink)" }}>Pick the one that fits your team.</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))", gap: "20px" }}>
              {ways.map((w, i) => (
                <article key={i} style={{ background: w.bg, border: `1px solid ${w.border}`, borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,36px)", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "20px", rowGap: "10px", alignContent: "start" }}>
                  <div style={{ gridRow: "1 / span 3", fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "clamp(56px,5vw,72px)", lineHeight: "0.85", color: "var(--orange)" }}>{w.n}</div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(20px,1.9vw,24px)", lineHeight: "1.25", letterSpacing: "-0.01em", color: w.head, margin: "0" }}>{w.t}</h3>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: w.body, margin: "0" }}>{w.b}</p>
                  <a href={w.href} style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--orange)", display: "inline-flex", alignItems: "center", minHeight: "44px", justifySelf: "start" }}>{w.cta}{" →"}</a>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "700px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>What you get back</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", color: "var(--ink)", margin: "0" }}>What your company gets back.</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "clamp(28px,4vw,48px)", marginBottom: "48px" }}>
              {back.map((g, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--rule)", paddingTop: "24px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "clamp(56px,5vw,72px)", lineHeight: "0.85", color: "var(--orange)", marginBottom: "18px" }}>{g.n}</div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(20px,1.9vw,24px)", lineHeight: "1.25", letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 10px" }}>{g.t}</h3>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0" }}>{g.b}</p>
                </div>
              ))}
            </div>
            <PillCTA size="lg" href="#start">Talk to us</PillCTA>
          </div>
        </section>
        <section id="coach" style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Ambition Coach</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", letterSpacing: "-0.01em", fontSize: "clamp(48px,5.6vw,80px)", lineHeight: "0.92", margin: "0 0 28px", color: "var(--cream)" }}>
                {"Five hours. One young person. "}
                <span style={{ color: "var(--orange)" }}>A real next step.</span>
              </h2>
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,32px)", margin: "0 0 20px" }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange-dark)", margin: "0 0 12px" }}>Our first coach</p>
                <p style={{ fontSize: "17px", lineHeight: "1.6", color: "var(--ink)", margin: "0 0 14px" }}>Our first coached student wanted to get into marketing. We paired him with a marketing director at NVIDIA for four conversations, and he went on to land a marketing job.</p>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", lineHeight: "1.5", color: "var(--ink)", margin: "0", paddingTop: "14px", borderTop: "1px solid var(--rule)" }}>
                  {"“I got a lot of clarity on my plan forward.” "}
                  <span style={{ fontWeight: "500", color: "var(--muted)" }}>The student, after session two</span>
                </p>
              </div>
              <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0 0 32px" }}>Next up is a pilot with EOYDC in East Oakland, pairing young adults with professionals in engineering, cybersecurity, and finance.</p>
              <PillCTA size="lg" href="/coach">Sign up to coach</PillCTA>
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--gray-mid)", margin: "0 0 8px" }}>How it works</p>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {coach.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: "16px", alignItems: "start", padding: "22px 0", borderTop: "1px solid rgb(250 250 248 / 0.12)" }}>
                    <span style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--orange)", color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "26px", lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>{c.n}</span>
                    <div>
                      <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", color: "var(--cream)", margin: "0 0 6px" }}>{c.t}</h3>
                      <p style={{ fontSize: "15px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0" }}>{c.b}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "12px", border: "1px solid rgb(250 250 248 / 0.16)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0", padding: "14px 20px", borderBottom: "1px solid rgb(250 250 248 / 0.12)" }}>Your time</p>
                {time.map((tm, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "12px 20px", borderBottom: "1px solid rgb(250 250 248 / 0.08)", fontFamily: "var(--font-heading)", fontSize: "15px", color: tm.color, fontWeight: tm.weight }}>
                    <span>{tm.k}</span>
                    <span>{tm.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="start" style={{ background: "var(--cream)", borderTop: "1px solid var(--rule)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Open a door</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>{"Let's talk about your team."}</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>{"Tell us a little about your company and what your people do. We'll come back with a plan that fits."}</p>
            </div>
            <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card-lg)", padding: "clamp(28px,4vw,40px)" }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 24px" }}>Start the conversation.</h3>
              <CompaniesContactForm />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
