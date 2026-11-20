/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Image from "next/image";
import DonateButton from "@/components/DonateButton";
import { pillClass } from "@/components/site/PillCTA";
import { HEADLINE_STATS } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Donate",
  description:
    "Help more students see what work can look like. Your gift brings introships, internships, and guidance from trusted adults to students who would not otherwise get them.",
};

// The Giving Tuesday band comes down by itself once the day has passed.
export const revalidate = 3600;
const GIVING_TUESDAY_ENDS = Date.parse("2026-12-02T08:00:00Z"); // midnight Pacific, end of Dec 1

const stats = HEADLINE_STATS.map((s) => ({ v: s.value, l: s.label, note: s.note, hasNote: !!s.note }));

const gets = [
  "Introships for every student in the building, and an internship for anyone who wants to go deeper",
  "A dashboard for every teacher, counselor, and mentor who works with them",
  "Career conversation prompts tied to each student's introships",
  "The school pays nothing in year one",
].map((t, i) => ({ n: String(i + 1).padStart(2, "0"), t }));

const uses = [
  { n: "01", t: "The App", b: "Your gift puts introships in front of young people who have never seen the jobs up close. Free for every student, in a classroom or on their own." },
  { n: "02", t: "The Content", b: "Donations power new careers, built with real professionals, and the Guide dashboard that puts every adult in a young person's corner. More careers to try on, and more adults ready to talk about them." },
  { n: "03", t: "The Proof", b: "See the real difference your support makes through updates, data, and student stories. We report honestly on outcomes because you deserve to know your gift is working." },
];

const faq = [
  { q: "How do I make a gift?", a: "You can give online, or email our philanthropy team at shannon@ambitionangels.org. Checks can be made payable to Ambition Angels and mailed to 380 Portage Ave., Palo Alto, CA 94306. For wire transfers, email us and we'll send the details." },
  { q: "Can I choose what my donation supports?", a: "We can't always promise you can choose where your donation goes, but every $100K+ gift warrants a conversation with our philanthropy team about your giving opportunities and the impact they will have." },
  { q: "Is Ambition Angels tax-exempt?", a: "Yes. Ambition Angels is a 501(c)(3) tax-exempt organization. Your gift is deductible to the extent allowed by law. Our tax ID number is 87-2513010." },
  { q: "Who supports Ambition Angels?", a: "Ambition Angels partners with mission-minded individuals and foundations whose support funds our work. We are grateful for our partners and their commitment to supporting low-income, Black and brown teens." },
];

export default function DonatePage() {
  const showBanner = Date.now() < GIVING_TUESDAY_ENDS;
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        {showBanner && (
          <>
            <section aria-label="Giving Tuesday" style={{ background: "var(--orange)" }}>
              <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "18px clamp(20px,4vw,32px)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 32px" }}>
                <p style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 18px", margin: "0" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", letterSpacing: "-0.01em", fontSize: "clamp(28px,3vw,40px)", lineHeight: "0.95", color: "var(--ink)" }}>Giving Tuesday · Dec 1</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", lineHeight: "1.4", color: "var(--ink)" }}>Help a young person explore careers before they have to choose one.</span>
                </p>
                <a className="hv-7ccd06" href="#give" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 26px", borderRadius: "999px", background: "var(--ink)", color: "var(--cream)", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "15px", flexShrink: "0" }}>Become an Angel →</a>
              </div>
            </section>
          </>
        )}
        <section style={{ position: "relative", background: "var(--ink)", overflow: "hidden" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(72px,9vw,120px) clamp(20px,4vw,32px) clamp(64px,8vw,96px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: "clamp(32px,5vw,72px)", alignItems: "end" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>Donate</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,6.6vw,100px)", lineHeight: "0.9", letterSpacing: "-0.015em", color: "var(--cream)", margin: "0" }}>
                {"Help more students see "}
                <span style={{ color: "var(--orange)" }}>what work can look like.</span>
              </h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "520px" }}>
              <p style={{ fontSize: "clamp(17px,1.5vw,19px)", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0" }}>{"Most students are asked to make big decisions before they've seen many real options. Your gift helps Ambition bring introships, internships for the students who want to go deeper, and guidance from trusted adults to students who would not otherwise get them."}</p>
              <div>
                <DonateButton className={pillClass("primary", "lg")}>Donate</DonateButton>
              </div>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--cream)", borderBottom: "1px solid var(--rule)", padding: "clamp(48px,6vw,72px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: "32px" }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,5vw,76px)", lineHeight: "0.9", color: "var(--orange)" }}>{s.v}</div>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", color: "var(--ink)", marginTop: "8px" }}>{s.l}</div>
                {s.hasNote && (
                  <>
                    <div style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--muted)", marginTop: "4px", maxWidth: "240px" }}>{s.note}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
        <section id="give" style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", textAlign: "center" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,6.4vw,96px)", lineHeight: "0.9", letterSpacing: "-0.015em", color: "var(--ink)", margin: "0 0 20px" }}>Give today.</h2>
            <p style={{ fontSize: "19px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0 0 32px" }}>Every dollar helps a young person explore careers before they have to choose one. 100% free for every student who needs it.</p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <DonateButton className={pillClass("primary", "lg")}>Become an Angel</DonateButton>
            </div>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "13px", color: "var(--muted)", margin: "16px 0 0" }}>Secure · Tax-deductible · Takes 60 seconds</p>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Directed giving</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>Sponsor a school.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0 0 14px" }}>One school. One year. Every student in it gets real career exposure, and every adult who works with them gets the tools to talk about it.</p>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--charcoal)", margin: "0 0 14px" }}>Some partners come to us with a school already in mind. A place they went, a place their company sits, a place their family cares about. Others ask us to bring them one. Both work.</p>
              <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--muted)", margin: "0 0 24px" }}>{"Some partners also fund a reward for the classroom or program that commits the most. If that's interesting, we'll build it in."}</p>
              <a href="mailto:hello@ambitionangels.org?subject=Sponsoring%20a%20school" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", display: "inline-flex", alignItems: "center", minHeight: "44px" }}>Talk to us about sponsoring a school →</a>
            </div>
            <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card-lg)", padding: "clamp(28px,4vw,40px)" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange-dark)", margin: "0 0 20px" }}>What one sponsored school gets</p>
              <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column" }}>
                {gets.map((g, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "12px", alignItems: "baseline", padding: "16px 0", borderTop: "1px solid var(--rule)" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "30px", lineHeight: "1", color: "var(--orange)" }}>{g.n}</span>
                    <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "17px", lineHeight: "1.45", color: "var(--ink)" }}>{g.t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(40px,6vw,80px)", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Why this matters</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,42px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 24px", color: "var(--ink)" }}>Most teens have seen fewer than five careers. Usually whatever their parents do.</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <p style={{ fontSize: "17px", lineHeight: "1.7", color: "var(--charcoal)", margin: "0" }}>{"Remi Sobomehin grew up in Portland, attended his father's community nonprofit as a kid, and made it to Stanford. Not luck. The right support showed up at the right time."}</p>
                <p style={{ fontSize: "17px", lineHeight: "1.7", color: "var(--charcoal)", margin: "0" }}>After graduating, he went to East Palo Alto and got to work. He kept hitting the same wall: he could not get teens to show up. Meanwhile his co-founder Demetric was at Facebook watching teens spend 8 hours a day on their phones.</p>
                <p style={{ fontSize: "17px", lineHeight: "1.7", color: "var(--charcoal)", margin: "0" }}>That is not a crisis to solve. That is the most powerful channel in the history of youth development.</p>
                <p style={{ fontSize: "17px", lineHeight: "1.7", color: "var(--charcoal)", margin: "0" }}>So they built for it. Ambition meets young people where they already are and gives them what no one else will: a real look at what a career feels like before they have to choose one.</p>
              </div>
            </div>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "16px" }}>
              <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", right: "-12px", top: "-56px", width: "96px", opacity: "0.35", pointerEvents: "none" }} />
              <figure style={{ margin: "0" }}>
                <Image src="/images/Remi-Sobomehin_edited_edited.jpg" width={2002} height={1609} sizes="(max-width: 768px) 50vw, 300px" alt="Remi Sobomehin" style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: "var(--radius-card)", display: "block" }} />
                <figcaption style={{ marginTop: "10px" }}>
                  <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", color: "var(--ink)" }}>Remi Sobomehin</span>
                  <span style={{ fontSize: "13px", color: "var(--muted)" }}>Founder & CEO</span>
                </figcaption>
              </figure>
              <figure style={{ margin: "48px 0 0" }}>
                <Image src="/images/deme_edited.jpg" width={841} height={638} sizes="(max-width: 768px) 50vw, 300px" alt="Demetric Sanders" style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: "var(--radius-card)", display: "block" }} />
                <figcaption style={{ marginTop: "10px" }}>
                  <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", color: "var(--ink)" }}>Demetric Sanders</span>
                  <span style={{ fontSize: "13px", color: "var(--muted)" }}>Tech Partner</span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Every dollar you give does work</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 48px", color: "var(--cream)" }}>{"Here's where your money goes."}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "20px" }}>
              {uses.map((u, i) => (
                <article key={i} style={{ background: "rgb(250 250 248 / 0.05)", border: "1px solid rgb(250 250 248 / 0.14)", borderRadius: "var(--radius-card-lg)", padding: "clamp(24px,3vw,32px)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "56px", lineHeight: "0.9", color: "var(--orange)", marginBottom: "16px" }}>{u.n}</div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "22px", color: "var(--cream)", margin: "0 0 10px" }}>{u.t}</h3>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0" }}>{u.b}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "820px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Questions about giving</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 32px", color: "var(--ink)" }}>Everything you need to know.</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {faq.map((q, i) => (
                <details key={i} style={{ borderTop: "1px solid var(--rule)", padding: "4px 0" }}>
                  <summary style={{ cursor: "pointer", minHeight: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "18px", color: "var(--ink)" }}>
                    {q.q}
                    <span aria-hidden="true" style={{ color: "var(--orange)", fontSize: "24px", lineHeight: "1" }}>+</span>
                  </summary>
                  <p style={{ fontSize: "16px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0 0 18px" }}>{q.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
