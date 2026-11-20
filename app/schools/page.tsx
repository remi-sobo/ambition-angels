/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import SchoolsInquiryForm from "@/components/SchoolsInquiryForm";
import PillCTA from "@/components/site/PillCTA";
import ScreenAdmin from "@/components/site/screens/ScreenAdmin";
import ScreenCareerLibrary from "@/components/site/screens/ScreenCareerLibrary";
import ScreenGuideDashboard from "@/components/site/screens/ScreenGuideDashboard";
import ScreenJoinCode from "@/components/site/screens/ScreenJoinCode";

export const metadata: Metadata = {
  title: "For Schools & Programs",
  description:
    "Career exposure for every student in your school or program, run by the adults already in the room. Introships take 8 to 10 minutes, so they fit inside advisory, CTE, after-school, and mentoring time.",
};

const fits = ["Advisory or homeroom", "CTE, AVID, and career-connected learning", "Flex periods and career days", "Middle school and community college cohorts", "After-school and mentoring programs", "Juvenile justice programs", "Faith communities", "Youth sports and clubs"];
const takes = [{ n: "01", t: "Chromebooks or a computer lab." }, { n: "02", t: "A short block. One introship takes 8 to 10 minutes." }, { n: "03", t: "One adult who owns it." }];
const teacher = ["A live roster of every student and the career they're exploring.", "Conversation prompts tied to the exact introship each student finished.", "Weekly follow-ups on the students who went quiet."];
const steps = [{ n: "01", t: "We load your rosters." }, { n: "02", t: "Students join with a code." }, { n: "03", t: "Teachers and staff get their dashboard." }];

export default function SchoolsPage() {  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "48px", right: "6%", width: "130px", opacity: "0.2", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(88px,11vw,144px) clamp(20px,4vw,32px) clamp(80px,9vw,112px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>For Schools & Programs</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(56px,8vw,96px)", lineHeight: "0.95", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px", maxWidth: "860px" }}>
              {"Bring Ambition "}
              <span style={{ color: "var(--orange)" }}>to your students.</span>
            </h1>
            <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "600px", margin: "0 0 36px" }}>Career exposure for every student in your school or program, run by the adults already in the room. Introships take 8 to 10 minutes, so they fit inside advisory, CTE, after-school, and mentoring time.</p>
            <PillCTA size="lg" href="#start">Talk to us</PillCTA>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Where it fits</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 32px", color: "var(--ink)" }}>It fits inside time you already run.</h2>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {fits.map((f, i) => (
                  <div key={i} style={{ padding: "18px 0", borderTop: "1px solid var(--rule)", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "19px", color: "var(--ink)" }}>{f}</div>
                ))}
              </div>
            </div>
            <div style={{ background: "var(--orange-light)", border: "1px solid rgb(232 80 10 / 0.1)", borderRadius: "var(--radius-card-lg)", padding: "clamp(28px,4vw,40px)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.12) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange-dark)", margin: "0 0 12px" }}>What it takes</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "28px", letterSpacing: "-0.02em", margin: "0 0 24px", color: "var(--ink)" }}>What it takes from you.</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "24px" }}>
                {takes.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "36px", lineHeight: "1", color: "var(--orange)", width: "44px", flexShrink: "0" }}>{t.n}</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", lineHeight: "1.4", color: "var(--ink)" }}>{t.t}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0", paddingTop: "20px", borderTop: "1px solid rgb(232 80 10 / 0.2)" }}>{"That's the whole ask. Nobody from Ambition needs to sit in your room."}</p>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "720px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>What students get</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--cream)" }}>Real careers, one after another.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0", textWrap: "pretty" }}>{"Students explore careers they've never seen up close, one short introship at a time. When one catches them, they can take the full internship for that career. By the end of the year they can tell you what several careers pay, what the work feels like, and how people get in."}</p>
            </div>
            <div style={{ maxWidth: "940px", margin: "0 auto" }}>
              <ScreenCareerLibrary onDark={true} center={true} caption="" />
            </div>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "680px", marginBottom: "48px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>What teachers and program staff get</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0", color: "var(--ink)" }}>{"Every adult in the room sees every student's progress."}</h2>
            </div>
            <div style={{ maxWidth: "980px", margin: "0 auto 48px" }}>
              <ScreenGuideDashboard />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: "20px" }}>
              {teacher.map((t, i) => (
                <div key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "24px", fontSize: "16px", lineHeight: "1.55", color: "var(--charcoal)" }}>{t}</div>
              ))}
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: "clamp(40px,6vw,72px)", alignItems: "center" }}>
            <ScreenAdmin />
            <div style={{ maxWidth: "460px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>What principals and program leaders get</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>One view across every class and site.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0" }}>Assign introships to a class, grade, or cohort and set a goal. Then see participation across every class or site, which careers students are exploring, and which teachers and staff are active. Pre and post data on future orientation, ready for your funders.</p>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--cream)", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", padding: "clamp(72px,8vw,96px) 0" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>For counselors</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 20px", color: "var(--ink)", textWrap: "balance" }}>Ambition is the layer underneath the counseling office.</h2>
            <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--muted)", margin: "0" }}>Students who have explored real careers show up with real questions. Your counselors do less explaining and more advising.</p>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: "clamp(40px,6vw,72px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Getting started</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 36px", color: "var(--ink)" }}>Easy to start.</h2>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: "20px", alignItems: "baseline", padding: "20px 0", borderTop: "1px solid var(--rule)" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "800", fontSize: "52px", lineHeight: "0.9", color: "var(--orange)", flexShrink: "0", width: "60px" }}>{s.n}</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "20px", color: "var(--ink)" }}>{s.t}</span>
                  </div>
                ))}
              </div>
            </div>
            <ScreenJoinCode />
          </div>
        </section>
        <section id="start" style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>What it costs</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--cream)" }}>{"Let's talk about your students."}</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0" }}>{"Every partnership looks a little different. Tell us about your school or program and we'll walk you through it."}</p>
            </div>
            <div style={{ background: "var(--cream)", borderRadius: "var(--radius-card-lg)", padding: "clamp(28px,4vw,40px)", boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "24px", letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 24px" }}>Start the conversation.</h3>
              <SchoolsInquiryForm />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
