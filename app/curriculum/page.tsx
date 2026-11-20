"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AppDownloadLink from "@/components/AppDownloadLink";
import PillCTA from "@/components/site/PillCTA";

type Category = "STEM" | "Business" | "Health & Society" | "Arts & Communication";

// The 50 introships, from myambition.app/introships. The fourth field is the
// slug of the internship page under /curriculum, for the 19 careers that have one.
const CAREERS: [Category, string, string, string][] = [["STEM", "Software Engineering", "Build the software people use every day, then find out why it broke.", "software-engineering"], ["Business", "Entrepreneurship", "Find a problem worth solving, then build a business people will pay for.", "entrepreneurship"], ["Health & Society", "Registered Nurse", "Care for patients, catch what changes, and make decisions that matter.", "nursing"], ["Business", "Accountant / CPA", "Examine financial records, explain what they show, and help people or organizations make sound decisions.", ""], ["Arts & Communication", "Game Designer", "Design how games work, then watch players break your best ideas.", "game-design"], ["STEM", "Civil Engineer", "Plan, design, and oversee infrastructure projects such as roads, bridges, and water systems.", ""], ["Arts & Communication", "Social Media Manager", "Plan what a brand says online, then learn from how people respond.", "social-media-management"], ["Health & Society", "Firefighter", "Train for emergencies, protect people, and stay ready when the call comes.", "firefighting"], ["STEM", "Architect", "Design buildings around people's needs, codes, and budgets, then see plans tested on site.", ""], ["Arts & Communication", "UX/UI Designer", "Design digital experiences that look clear and make sense to use.", "ux-ui-design"], ["STEM", "Electrician", "Install, test, and repair electrical systems across changing job sites.", ""], ["Health & Society", "Physical Therapist", "Help people move better, recover function, and return to everyday life.", "physical-therapy"], ["Arts & Communication", "Chef", "Lead a kitchen, create great food, and keep everything moving.", "culinary-arts"], ["Business", "Sales", "Understand what someone needs, make your case, and hear no a lot.", "sales"], ["STEM", "Data Scientist", "Use data, statistics, and computing to answer questions and help organizations make better decisions.", ""], ["Business", "Paralegal", "Help legal teams research cases, organize records, prepare documents, and keep deadlines on track.", ""], ["Arts & Communication", "Graphic Designer", "Create visual designs that communicate ideas across products, publications, and digital experiences.", ""], ["Health & Society", "Mental Health Therapist", "Help people understand what they are facing and build healthier ways forward.", "mental-health-therapy"], ["Business", "Marketing", "Figure out what makes people care, then prove your campaign worked.", "marketing"], ["STEM", "Cybersecurity Analyst", "Protect computer systems from attacks; investigate alerts, tighten defenses, and sometimes respond after hours.", ""], ["Business", "Project Manager", "Keep people, deadlines, and details moving toward the same finish line.", "project-management"], ["Business", "Event Planner", "Turn a big idea into an event that actually runs smoothly.", "event-planning"], ["Health & Society", "Emergency Medical Technician / Paramedic", "Assess people in emergencies, provide care within your training, and help get them to the right care.", ""], ["Arts & Communication", "Photographer/Videographer", "Turn real moments and ideas into images people actually want to watch.", "photography-videography"], ["Health & Society", "Physician Assistant", "Examine patients, solve medical problems, and coordinate care; every decision affects a real person.", ""], ["Business", "Wealth Manager", "Help clients make smart decisions about money and their future.", "wealth-management"], ["Business", "Product Manager", "Turn customer problems into clear priorities and help a team build the right solution.", ""], ["Health & Society", "Middle School Teacher", "Teach a subject while helping young students learn, grow, and stay on track.", ""], ["STEM", "Automotive Technician", "Diagnose, maintain, and repair cars and light trucks using tools, tests, and technical information.", ""], ["Health & Society", "Dental Assistant", "Help dental teams prepare for visits, support patients, and keep clinical rooms and records organized.", ""], ["STEM", "Construction Manager", "Coordinate people, budgets, timelines, and jobsite decisions to complete building projects safely.", ""], ["Health & Society", "Personal Trainer", "Help people train safely, stay motivated, and make real progress.", "personal-training"], ["Health & Society", "Dental Hygienist", "Help patients protect their oral health through cleanings, preventive care, education, and careful observations.", ""], ["Arts & Communication", "Film/Video Editor", "Shape raw footage into clear, engaging stories for film, television, online video, or other media.", ""], ["STEM", "HVAC Technician", "Install, inspect, and repair heating, ventilation, air-conditioning, and refrigeration systems.", ""], ["Business", "HR Manager", "Help a company make fair decisions about the people who work there.", "human-resources"], ["Arts & Communication", "Barber/Stylist", "Turn what a client wants into a look they trust you to create.", "stylist-barber"], ["STEM", "Plumber", "Install, inspect, and repair water, gas, and drainage systems in homes and other buildings.", ""], ["Health & Society", "Occupational Therapist", "Help people build or regain skills for everyday activities at home, school, work, and in the community.", ""], ["STEM", "Commercial Pilot", "Fly aircraft for work such as charter trips, aerial tours, instruction, or specialized services.", ""], ["Health & Society", "Nurse Practitioner", "Assess patients, coordinate care, and help manage health needs in a specialty or primary care setting.", ""], ["STEM", "Biomedical Engineer", "Use engineering and life sciences to design, test, or support devices and systems used in healthcare.", ""], ["Business", "Lawyer", "Research legal questions, advise clients, and help people or organizations navigate disputes and decisions.", ""], ["Health & Society", "Environmental Scientist", "Study environmental conditions and evidence to help protect ecosystems and human health.", ""], ["Health & Society", "Radiologic Technologist", "Create diagnostic images that help healthcare teams assess injuries and plan patient care.", ""], ["Health & Society", "Speech-Language Pathologist", "Help people strengthen communication and swallowing skills through assessment, practice, and personalized support.", ""], ["Business", "Real Estate Agent", "Help clients search for, market, and complete purchases or rentals of homes and other properties.", ""], ["STEM", "Industrial / Robotics Technician", "Install, test, troubleshoot, and maintain automated equipment used in manufacturing and other industries.", ""], ["STEM", "Mechanical Engineer", "Design and test machines, then revise them when tests reveal problems.", ""], ["Health & Society", "Police Officer / Detective", "Respond to calls, protect people, and investigate cases, often across shifts and under pressure.", ""]];

const CATS = ["All", "Business", "STEM", "Arts & Communication", "Health & Society"] as const;
const ICONS: Record<Category, string> = {
  STEM: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  Business: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  "Health & Society": "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  "Arts & Communication": "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
};
const TILE: Record<Category, [string, string]> = {
  STEM: ["var(--ink)", "var(--cream)"],
  Business: ["var(--orange)", "#fff"],
  "Health & Society": ["var(--orange-light)", "var(--orange-dark)"],
  "Arts & Communication": ["var(--gray-light)", "var(--ink)"],
};
const FEATURED = 8;
const WITH_INTERNSHIP = CAREERS.filter((c) => c[3]).length;

const heroStats = [
  { v: "8 to 10", l: "Minutes per introship" },
  { v: String(WITH_INTERNSHIP), l: "Careers with a full internship" },
  { v: "Free", l: "For every student" },
];

export default function CareersPage() {
  const [active, setActive] = useState<(typeof CATS)[number]>("All");
  const [showAll, setShowAll] = useState(false);

  const list = showAll ? CAREERS.filter((c) => active === "All" || c[0] === active) : CAREERS.slice(0, FEATURED);
  const cards = list.map(([cat, name, desc, slug]) => ({
    cat, name, desc, icon: ICONS[cat], tileBg: TILE[cat][0], tileFg: TILE[cat][1],
    hasInternship: !!slug, href: "/curriculum/" + slug,
  }));
  const filters = CATS.map((label) => {
    const on = label === active;
    return { label, on, pick: () => setActive(label), bg: on ? "var(--orange)" : "#fff", color: on ? "#fff" : "var(--charcoal)", border: on ? "var(--orange)" : "var(--rule)" };
  });
  const libTitle = showAll ? `All ${CAREERS.length} careers` : "A few to start with";
  const toggleLabel = showAll ? "Show fewer" : `See all ${CAREERS.length} careers`;
  const toggleBg = showAll ? "transparent" : "var(--ink)";
  const toggleFg = showAll ? "var(--ink)" : "var(--cream)";
  const toggleAll = () => {
    setShowAll((a) => !a);
    setActive("All");
  };
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(72px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: "clamp(40px,5vw,56px)", alignItems: "stretch" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>The Career Library</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(52px,6.6vw,80px)", lineHeight: "0.98", letterSpacing: "-0.01em", color: "var(--cream)", margin: "0 0 24px" }}>
                50 careers.
                <br />
                <span style={{ color: "var(--orange)" }}>Try as many as you want.</span>
              </h1>
              <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--gray-mid)", margin: "0", maxWidth: "560px", textWrap: "pretty" }}>Every career starts with an 8 to 10 minute introship. Students who find one they love can go deeper. For 19 careers, that means a full internship: a month inside the career with a fictional employer, a manager, and a real project to finish.</p>
              <div style={{ marginTop: "48px", display: "flex", flexWrap: "wrap", gap: "24px 40px" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "40px", lineHeight: "1", color: "var(--orange)", marginBottom: "4px" }}>50</div>
                  <div style={{ fontSize: "14px", color: "var(--gray-mid)" }}>Careers</div>
                </div>
                {heroStats.map((s, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: "900", fontSize: "40px", lineHeight: "1", color: "var(--orange)", textTransform: "uppercase" }}>{s.v}</div>
                    <div style={{ fontSize: "14px", color: "var(--gray-mid)", marginTop: "4px" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: "relative", minHeight: "420px", borderRadius: "var(--radius-card-lg)", overflow: "hidden" }}>
              <Image src="/images/curriculum-hero.jpg" alt="" width={2400} height={3000} sizes="(max-width: 900px) 100vw, 50vw" priority style={{ position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", top: "0", bottom: "0", left: "0", width: "20%", background: "linear-gradient(to right, #0E0E0E, transparent)" }} />
            </div>
          </div>
        </section>
        <section style={{ background: "var(--cream)", padding: "clamp(64px,8vw,96px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 32px", marginBottom: "32px" }}>
              <div>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 12px" }}>Introships</p>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", color: "var(--ink)", margin: "0" }}>{libTitle}</h2>
              </div>
              <p style={{ fontSize: "15px", lineHeight: "1.5", color: "var(--charcoal)", margin: "0", maxWidth: "380px" }}>
                {"Every career has an introship. The ones marked "}
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", color: "var(--orange-dark)" }}>Internship too</span>
                {" also have the full 30-day internship."}
              </p>
            </div>
            {showAll && (
              <>
                <div role="group" aria-label="Filter careers" style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "28px" }}>
                  {filters.map((f, i) => (
                    <button key={i} onClick={f.pick} type="button" aria-pressed={f.on} style={{ fontFamily: "var(--font-heading)", fontWeight: "500", fontSize: "14px", padding: "0 20px", minHeight: "44px", borderRadius: "999px", cursor: "pointer", background: f.bg, color: f.color, border: `1px solid ${f.border}` }}>{f.label}</button>
                  ))}
                </div>
              </>
            )}
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,250px),1fr))", gap: "20px" }}>
              {cards.map((c, i) => (
                <li key={i} style={{ background: "#fff", border: "1px solid var(--rule)", borderRadius: "var(--radius-card-lg)", padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                    <span aria-hidden="true" style={{ width: "48px", height: "48px", borderRadius: "14px", background: c.tileBg, color: c.tileFg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: "0" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={c.icon} />
                      </svg>
                    </span>
                    <span style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", padding: "5px 12px", borderRadius: "999px", background: "var(--orange-light)", color: "var(--orange-dark)", textAlign: "right", lineHeight: "1.3" }}>{c.cat}</span>
                  </div>
                  <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "19px", lineHeight: "1.25", color: "var(--ink)", margin: "0" }}>{c.name}</h3>
                  <p style={{ fontSize: "15px", lineHeight: "1.55", color: "var(--charcoal)", margin: "0", flex: "1" }}>{c.desc}</p>
                  {c.hasInternship && (
                    <>
                      <Link href={c.href} style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px", fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "13px", color: "var(--orange-dark)" }}>Internship too →</Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "36px" }}>
              <button type="button" onClick={toggleAll} aria-expanded={showAll} style={{ minHeight: "52px", padding: "0 32px", borderRadius: "999px", border: "1.5px solid var(--ink)", background: toggleBg, color: toggleFg, fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "16px", cursor: "pointer" }}>{toggleLabel}</button>
            </div>
            <div style={{ marginTop: "48px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px", border: "1px solid rgb(232 80 10 / 0.2)", background: "var(--orange-light)", borderRadius: "var(--radius-card-lg)", padding: "24px 28px" }}>
              <div style={{ flex: "1", minWidth: "240px" }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "20px", color: "var(--ink)", margin: "0 0 4px" }}>Not sure where to start?</h2>
                <p style={{ fontSize: "15px", color: "var(--charcoal)", margin: "0" }}>{"Answer a few quick questions and we'll point you to careers worth exploring."}</p>
              </div>
              <PillCTA href="/teens/career-quiz">Take the Career Quiz</PillCTA>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ maxWidth: "640px", marginBottom: "40px" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Coming soon</p>
              <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--ink)" }}>More careers on the way.</h2>
              <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--muted)", margin: "0" }}>{"Every career is built with professionals who do the job. Companies can sponsor a new career built from their own people's stories. Donors help us get these to students faster."}</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
              <PillCTA href="/companies">Sponsor a career</PillCTA>
              <PillCTA variant="secondary" href="/donate">Fund a new career</PillCTA>
              <a href="mailto:hello@ambitionangels.org?subject=Career%20suggestion" style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "14px", textDecoration: "underline", textUnderlineOffset: "3px" }}>{"Or tell us what's missing"}</a>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Get started</p>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(34px,4.2vw,48px)", letterSpacing: "-0.02em", lineHeight: "1.12", margin: "0 0 20px", color: "var(--cream)" }}>Ready to explore?</h2>
            <p style={{ fontSize: "18px", lineHeight: "1.65", color: "var(--gray-mid)", margin: "0 0 36px" }}>Download Ambition and pick your first career. 8 to 10 minutes to start. Free for every student.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <AppDownloadLink platform="ios" className="aa-pill aa-pill--primary aa-pill--lg">App Store</AppDownloadLink>
              <AppDownloadLink platform="android" className="aa-pill aa-pill--ghostDark aa-pill--lg">Google Play</AppDownloadLink>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
