import type { Metadata } from "next";
import Image from "next/image";
import { STATS } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Our Impact",
  description:
    "Career exposure is one of the few things that reliably moves a teen's economic trajectory. Here is what our data shows, and the research behind it.",
};

/** Split "3,500+" into the numeral and its trailing mark so the mark can sit smaller. */
const split = (value: string) => {
  const m = value.match(/^(.*?)([+%]?)$/);
  return { num: m?.[1] ?? value, sup: m?.[2] ?? "" };
};

const stats = [
  { ...split(STATS.teensReached.value), label: STATS.teensReached.label },
  { ...split("36"), label: STATS.partners.label },
  { ...split(STATS.secondInternship.value), label: "Come back to explore a second career" },
  { ...split(STATS.hoursDelivered.value), label: STATS.hoursDelivered.label },
];

const gapFacts = [
  { num: "By 15", title: "The career conversation is the central lever.", body: "Career conversations with a trusted adult by age 15 are one of the strongest independent predictors of adult employment outcomes. Everything we build exists to make that conversation happen, and happen well.", source: "OECD Career Readiness Research · 2021" },
  { num: "By 16", title: "Career uncertainty by 16 predicts disconnection.", body: "Teens who can't picture a career by 16 are far more likely to be unemployed or disconnected from school and work by their mid-20s.", source: "OECD Career Readiness Research · 2021" },
  { num: "< 5", title: "Most teens have seen fewer than five careers.", body: "Usually whatever their parents do. The world has thousands of paths, and the teens with the least access to networks see the fewest of them.", source: "" },
];

const respond = [
  { num: "01", title: "Real career exposure", body: "Introships built with real professionals. Students explore many careers, seeing what each job is and what it pays, before they ever have to choose. Students who want more go further with an internship or a coach." },
  { num: "02", title: "In schools and programs", body: "On the web during class or program time, with every student in the room on the computers they already use. On the phone everywhere else. Same account either way, so exposure doesn't stop at the bell." },
  { num: "03", title: "A trusted adult in the room", body: "The teens who shift their career thinking are almost always connected to an adult who knows they are doing it. We equip teachers, counselors, mentors, and parents to be that person, even if nobody ever did it for them." },
];

const research = [
  { stat: "By 15", finding: "Career conversations with a trusted adult by age 15 are one of the strongest independent predictors of adult employment outcomes. We are making it possible for any parent, teacher, or mentor to have that conversation well.", source: "OECD Career Readiness Research · 2021" },
  { stat: "40/47", finding: "Longitudinal studies found teens with early career exposure had better adult employment outcomes, with wage gains of 5 to 10% not uncommon, even after controlling for academic achievement and social background.", source: "OECD Career Readiness Review · 2021" },
  { stat: "5 to 10%", finding: "Wage boost in adulthood tied specifically to early career exposure. Even career conversations, job shadowing, and simulated experience showed measurable long-term impact on earnings.", source: "OECD, From Classroom to Career · 2025" },
];

const measures = [
  { tag: "Career Exposure", title: "Exploration Breadth", body: "How many fields and roles has a teen meaningfully engaged with? Broader exploration earlier leads to better decisions later." },
  { tag: "Career Exposure", title: "Career Conversation Quality", body: "Are teens talking to adults about their futures? Mentorship and career conversations are independently proven to improve labor market outcomes." },
  { tag: "The Outcome", title: "Future Orientation", body: "Can a teen envision a future for themselves, and are they taking concrete steps toward it? That action piece is our strongest result: the 14% gain measured across 1,000+ teens." },
];

export default function ImpactPage() {
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--ink)", overflow: "hidden" }}>
          <Image src="/images/elizeu-dias-2EGNqazbAMk-unsplash.jpg" width={2400} height={1600} sizes="100vw" alt="" aria-hidden="true" style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: "0", background: "rgb(14 14 14 / 0.6)" }} />
          <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", padding: "clamp(96px,12vw,160px) clamp(20px,4vw,32px) clamp(88px,10vw,128px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>Our Impact</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(56px,8vw,96px)", lineHeight: "0.95", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px", maxWidth: "720px" }}>
              {"Career exposure "}
              <span style={{ color: "var(--orange)" }}>works.</span>
            </h1>
            <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", maxWidth: "640px", margin: "0" }}>{"Career exposure is one of the few things that reliably moves a teen's economic trajectory. We have the data. Here is what it shows."}</p>
          </div>
        </section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", borderBottom: "1px solid var(--gray-light)" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: "var(--cream)", padding: "clamp(28px,3vw,40px) 32px", borderRight: "1px solid var(--gray-light)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "clamp(40px,4vw,52px)", lineHeight: "1", color: "var(--ink)", marginBottom: "8px" }}>
                {s.num}
                <span style={{ color: "var(--orange)" }}>{s.sup}</span>
              </div>
              <div style={{ fontSize: "14px", lineHeight: "1.4", color: "var(--muted)", maxWidth: "200px" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <section style={{ background: "var(--gray-light)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 12px" }}>The Problem</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 16px", color: "var(--ink)" }}>The gap is not ambition. It is access.</h2>
            <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--muted)", maxWidth: "680px", margin: "0 0 48px" }}>Teens from low-income communities graduate knowing academic subjects, not how to make their way in a workforce that is changing faster than any curriculum can keep up with. Career exposure is a proven pathway to economic mobility. Right now it goes to the teens who need it least.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,6vw,80px)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {gapFacts.map((f, i) => (
                  <div key={i} style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "22px", display: "flex", alignItems: "flex-start", gap: "20px" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "32px", lineHeight: "1", color: "var(--orange)", flexShrink: "0", minWidth: "76px" }}>{f.num}</div>
                    <div>
                      <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", color: "var(--ink)", margin: "0 0 4px" }}>{f.title}</p>
                      <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--muted)", margin: "0 0 8px" }}>{f.body}</p>
                      <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", margin: "0" }}>{f.source}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>How We Respond</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {respond.map((r, i) => (
                    <div key={i} style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "22px" }}>
                      <p style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "12px", letterSpacing: "0.16em", color: "var(--orange)", margin: "0 0 8px" }}>{r.num}</p>
                      <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", color: "var(--ink)", margin: "0 0 6px" }}>{r.title}</h3>
                      <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--muted)", margin: "0" }}>{r.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>Our Results</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,5vw,64px)", alignItems: "center" }}>
              <div style={{ position: "relative", background: "var(--orange)", borderRadius: "var(--radius-card-lg)", padding: "clamp(40px,5vw,56px)", textAlign: "center", overflow: "hidden", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "clamp(96px,11vw,144px)", lineHeight: "1", color: "#fff", letterSpacing: "-0.02em" }}>14%</span>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "16px", lineHeight: "1.5", color: "#fff", margin: "16px auto 0", maxWidth: "420px" }}>Increase in Action Orientation, the highest-gain dimension within our Future Orientation Score (FOS).</p>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#fff", margin: "16px 0 0" }}>Pre and post · 1,000+ teens · Measured across our school and nonprofit program partners</p>
              </div>
              <div>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>Teens do not just feel better about the future. They act on it.</h2>
                <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--muted)", margin: "0 0 16px" }}>The Future Orientation Score (FOS) tracks how teens think about and move toward their futures across multiple dimensions. We measure before and after every program cycle.</p>
                <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--muted)", margin: "0 0 16px" }}>Action Orientation, one element within the FOS, measures whether a teen is taking real steps toward a career, not just imagining one. Across 1,000+ teens, it showed the biggest improvement of any dimension we track.</p>
                <p style={{ fontSize: "17px", lineHeight: "1.65", fontWeight: "600", color: "var(--ink)", margin: "0" }}>{"Career exposure alone doesn't break the cycle of poverty. But a teen who can see a path and starts walking it has a real shot that a teen who can't see one doesn't."}</p>
              </div>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 12px" }}>The Evidence Base</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.8vw,44px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 40px", color: "var(--cream)", maxWidth: "860px", textWrap: "balance" }}>We did not invent the link between career exposure and economic mobility. We built a program to help deliver it at scale.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "1px", background: "rgb(255 255 255 / 0.08)", border: "1px solid rgb(255 255 255 / 0.08)", borderRadius: "var(--radius-card-lg)", overflow: "hidden" }}>
              {research.map((r, i) => (
                <div key={i} style={{ background: "var(--ink-soft)", padding: "32px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "40px", lineHeight: "1", color: "var(--orange)", marginBottom: "20px" }}>{r.stat}</div>
                  <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0 0 20px" }}>{r.finding}</p>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgb(255 255 255 / 0.6)", margin: "0", paddingTop: "16px", borderTop: "1px solid rgb(255 255 255 / 0.07)" }}>{r.source}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section style={{ background: "var(--gray-light)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 12px" }}>Our Evaluation Framework</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 12px", color: "var(--ink)" }}>What we track.</h2>
            <p style={{ fontSize: "17px", lineHeight: "1.65", color: "var(--muted)", maxWidth: "560px", margin: "0 0 40px" }}>Two areas. One question: does this program put teens on a different economic trajectory?</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "20px" }}>
              {measures.map((m, i) => (
                <div key={i} style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "28px" }}>
                  <span style={{ display: "inline-block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--orange-dark)", background: "var(--orange-light)", borderRadius: "6px", padding: "3px 8px", marginBottom: "12px" }}>{m.tag}</span>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", color: "var(--ink)", margin: "0 0 8px" }}>{m.title}</h3>
                  <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--muted)", margin: "0" }}>{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
