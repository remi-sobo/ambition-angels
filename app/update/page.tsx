import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Image from "next/image";
import IPhoneMockup from "@/components/IPhoneMockup";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Q2 2026 Investor Update — Ambition Angels",
  description:
    "We know it works. Now we scale it. A Q2 2026 update from Remi Sobomehin, Founder of Ambition Angels.",
};

const orange = "#E8500A";
const navy = "#1E2235";
const cream = "#FFF7F4";

const stats = [
  { number: "3,500+", label: "Teens reached since launch" },
  { number: "1,000+", label: "Active since public launch June 2025" },
  { number: "74%", label: "Start a second internship" },
  { number: "+14%", label: "Future Orientation Score" },
  { number: "36+", label: "Partners" },
  { number: "87%", label: "From Title I schools" },
];

const tiers = [
  {
    amount: "$10,000",
    name: "Founding Partner",
    description:
      "Funds a full cohort of teens through one internship track. By the end, they know what a career actually feels like.",
    highlight: false,
  },
  {
    amount: "$25,000",
    name: "Content & Experience Partner",
    description:
      "Funds new internship track development and partner onboarding. Directly expands what teens can explore.",
    highlight: true,
  },
  {
    amount: "$50,000",
    name: "Student Access Partner",
    description:
      "Funds the Ambition Fund — our philanthropy-powered track for high-need teens without an existing support system.",
    highlight: false,
  },
  {
    amount: "$100,000",
    name: "School & Nonprofit Rollout Partner",
    description:
      "Funds the adult dashboard build-out and partner expansion. The infrastructure that makes scale possible.",
    highlight: false,
  },
  {
    amount: "$250,000",
    name: "Regional Anchor Partner",
    description:
      "Anchors our 2026 operating model. Takes us from early proof to repeatable system at Bay Area scale.",
    highlight: false,
  },
];

const dotColors = ["#E8500A", "#1E2235", "#6B7280", "#374151", "#9CA3AF"];

const model = [
  {
    num: "01",
    title: "Exposure",
    sub: "The Ambition App",
    desc: "30-day simulated internships in real careers. 15 minutes a day. On the phone they already have. Wide reach. Low lift. High engagement. Already proven.",
    status: "Live",
  },
  {
    num: "02",
    title: "Conversations",
    sub: "The adult layer",
    desc: "When a teen completes lessons, their trusted adult receives a customized conversation guide — specific questions, specific context, tied to exactly what their teen just experienced. Think dinner table conversation cards, built around your kid's actual career interests. Research shows career conversations with a trusted adult by age 15 are one of the strongest predictors of adult employment outcomes.",
    status: "In beta now",
  },
  {
    num: "03",
    title: "Connections",
    sub: "Ambition Coaches",
    desc: "For teens who have gone deep and chosen a direction. We connect them with a professional in the field they care about for 4 sessions over 4 weeks. The goal: a career plan and a real first connection in their chosen field.",
    status: "First pilot in progress",
  },
];

const priorities = [
  {
    num: "01",
    title: "Adult Platform",
    desc: "Parent and mentor dashboard, customized conversation guides, adult engagement tools. The infrastructure that makes the trusted adult layer real and scalable. Close to beta.",
  },
  {
    num: "02",
    title: "Content Expansion",
    desc: "New internship tracks in AI-focused careers and life skills built around the skills AI cannot automate. Built with employer and industry partners.",
  },
  {
    num: "03",
    title: "Ambition Coaches",
    desc: "Recruitment, vetting, and infrastructure for our first cohort of industry professionals. First pilot in progress.",
  },
  {
    num: "04",
    title: "Partner Integration Toolkit",
    desc: "So any youth-serving org can bring Ambition Angels in without needing us in the room every time.",
  },
];

const goals = [
  "2,000 teens actively engaging, with a clear path to 5,000",
  "Adults consistently using the platform to guide teens through career conversations",
  "Ambition Coaches model designed, piloted, and ready to grow",
  "Expanded partner network across juvenile detention, mentoring orgs, and school partners",
  "Continued growth in Future Orientation Score across our student population",
];

const skills = [
  "Curiosity",
  "Creativity",
  "Critical Thinking",
  "Communication",
  "Relationship Building",
  "Business Mindset",
];

export default function UpdatePage() {
  return (
    <div
      className={poppins.className}
      style={{ background: "#ffffff", color: "#1a1a1a", minHeight: "100vh" }}
    >
      <style>{`
        .upd-hero-grid { display:flex; flex-direction:row; gap:48px; align-items:center; }
        .upd-hero-text { flex:1; min-width:0; }
        .upd-hero-photo { width:380px; flex-shrink:0; height:420px; border-radius:16px; overflow:hidden; position:relative; }
        .upd-app-grid { display:flex; flex-direction:row; gap:48px; align-items:center; }
        .upd-app-text { flex:1; min-width:0; }
        .upd-two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .upd-photo-break { position:relative; width:100%; height:320px; border-radius:16px; overflow:hidden; margin:40px 0; }
        .upd-photo-quote { font-size:22px; }
        .upd-model-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        @media (max-width: 640px) {
          .upd-hero-grid { flex-direction:column; gap:28px; }
          .upd-hero-photo { width:100%; height:260px; flex-shrink:unset; }
          .upd-app-grid { flex-direction:column; gap:32px; }
          .upd-two-col { grid-template-columns:1fr; }
          .upd-photo-break { height:240px; }
          .upd-photo-quote { font-size:18px; }
          .upd-model-grid { grid-template-columns:1fr; }
        }
      `}</style>

      {/* NAV */}
      <nav style={{ padding:"20px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #f0ede8", maxWidth:900, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ background:orange, borderRadius:10, width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M7 17L17 7M17 7H8M17 7V16" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ color:navy, fontWeight:700, fontSize:16, letterSpacing:"-0.02em" }}>Ambition Angels</span>
        </div>
        <span style={{ color:"#9CA3AF", fontSize:11, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase" }}>
          Q2 2026 Update
        </span>
      </nav>

      <main style={{ maxWidth:900, margin:"0 auto", padding:"0 32px 80px" }}>

        {/* ── HERO ── */}
        <section style={{ paddingTop:64, paddingBottom:48 }}>
          <div className="upd-hero-grid">
            <div className="upd-hero-text">
              <div style={{ display:"inline-block", background:"#FFF0EA", border:`1px solid ${orange}30`, color:orange, fontSize:11, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", padding:"5px 14px", borderRadius:100, marginBottom:24 }}>
                Q2 2026 Investor Update
              </div>
              <h1 style={{ fontSize:"clamp(28px, 4.5vw, 48px)", fontWeight:800, lineHeight:1.1, letterSpacing:"-0.03em", color:navy, marginBottom:16 }}>
                We know it works.{" "}
                <span style={{ color:orange }}>Now we scale it.</span>
              </h1>
              <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.7, marginBottom:0 }}>
                The career landscape is shifting faster than most adults can track, let alone teenagers. Here is <strong style={{ color:navy }}>where we are</strong>, <strong style={{ color:navy }}>what we have built</strong>, and <strong style={{ color:navy }}>where we are going next</strong>.
              </p>
            </div>
            <div className="upd-hero-photo">
              <Image src="/images/jonas-leupe-wK-elt11pF0-unsplash.jpg" alt="Teen looking at their phone" fill priority style={{ objectFit:"cover", objectPosition:"center" }} />
            </div>
          </div>
        </section>

        <div style={{ width:36, height:4, background:orange, borderRadius:2, marginBottom:48 }} />

        {/* ── WHERE WE ARE ── */}
        <section style={{ marginBottom:56 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>Where we are</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:20, lineHeight:1.15 }}>
            The model is working. The need is urgent.
          </h2>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:14, maxWidth:680 }}>
            We launched Ambition to solve a specific problem: teens from low-income communities graduate knowing academic subjects but not how to navigate a workforce changing faster than any curriculum can keep up with. Our answer was to meet them on the device they already use for 8 hours a day.
          </p>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:32, maxWidth:680 }}>
            Four years in, the data tells a clear story. Teens are showing up. They are finishing. And they are coming back. We know this works. The work now is scale.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:12 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background:cream, border:`1px solid ${orange}25`, borderRadius:12, padding:"20px 16px", textAlign:"center" }}>
                <div style={{ fontSize:32, fontWeight:800, color:orange, letterSpacing:"-0.03em", lineHeight:1, marginBottom:6 }}>{s.number}</div>
                <div style={{ fontSize:10, fontWeight:600, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT TEENS DO ── */}
        <section style={{ marginBottom:56 }}>
          <div className="upd-app-grid">
            <div className="upd-app-text">
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>What teens do on the app</div>
              <h2 style={{ fontSize:"clamp(22px, 3vw, 32px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:16, lineHeight:1.2 }}>
                They don&apos;t just learn about careers. They try them.
              </h2>
              <p style={{ fontSize:15, color:"#4B5563", lineHeight:1.75, marginBottom:16 }}>
                On the Ambition App, students complete 30-day simulated internships across business, tech, health, creative fields, and more. 15 minutes a day. Real tasks. Real skills. Real rewards. By the end of 30 days, they know what a career actually feels like.
              </p>
            </div>
            {/* Phone mockup */}
            <div style={{ display:"flex", justifyContent:"center", flexShrink:0 }}>
              <IPhoneMockup />
            </div>
          </div>
        </section>

        {/* Quote — after app section */}
        <blockquote style={{ borderLeft:`4px solid ${orange}`, background:cream, borderRadius:"0 12px 12px 0", padding:"24px 28px", marginBottom:56 }}>
          <p style={{ fontSize:18, fontStyle:"italic", color:navy, fontWeight:500, lineHeight:1.6, marginBottom:10 }}>
            &ldquo;The wealth management track changed how I think about money. I taught my mom what I learned and I am starting to think I might have a future here.&rdquo;
          </p>
          <cite style={{ fontSize:12, color:"#9CA3AF", fontStyle:"normal", fontWeight:600, letterSpacing:"0.05em", textTransform:"uppercase" }}>
            Marcus T., 11th Grade &middot; East Palo Alto, CA
          </cite>
        </blockquote>

        <div style={{ width:36, height:4, background:orange, borderRadius:2, marginBottom:48 }} />

        {/* ── THE KEY INSIGHT ── */}
        <section style={{ marginBottom:0 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>The key insight</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:20, lineHeight:1.15 }}>
            Teens engage when a trusted adult is in the room.
          </h2>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:14, maxWidth:680 }}>
            We built Ambition to go directly to teens. And we were right that the phone was the channel. But we learned something critical: the teens who complete internships and actually shift their career thinking are almost always connected to an adult who knows they are doing it. A counselor. A coach. A mentor. A parent. Someone who can say: tell me what you learned today.
          </p>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:14, maxWidth:680 }}>
            We stopped asking how to get teens to activate on their own. We started asking how to equip the adults who already love them to bring them in and keep them going. That insight is reshaping everything we are building in 2026.
          </p>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, maxWidth:680 }}>
            The app does the work. The adult makes it stick.
          </p>
        </section>

        {/* Photo break with pull quote */}
        <div className="upd-photo-break">
          <Image src="/images/derick-anies-hDJT_ERrB-w-unsplash.jpg" alt="Teen with ambition" fill style={{ objectFit:"cover", objectPosition:"center top" }} />
          <div style={{ position:"absolute", inset:0, background:"rgba(14,14,14,0.70)", display:"flex", flexDirection:"column", alignItems:"flex-start", justifyContent:"flex-end", padding:"28px 32px" }}>
            <p className="upd-photo-quote" style={{ fontFamily:"Poppins, sans-serif", fontStyle:"italic", color:"#ffffff", fontWeight:600, maxWidth:520, textAlign:"left", lineHeight:1.55, margin:"0 0 14px 0" }}>
              &ldquo;Every individual has massive potential. When teens are set on a pathway to an economically empowered future, we all benefit.&rdquo;
            </p>
            <div style={{ width:32, height:3, background:orange, borderRadius:2, marginBottom:10 }} />
            <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.55)", letterSpacing:"0.1em", textTransform:"uppercase" }}>
              Remi Sobomehin, Founder &amp; CEO
            </span>
          </div>
        </div>

        {/* ── THE MODEL ── */}
        <section style={{ marginBottom:56 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>The model</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:14, lineHeight:1.15 }}>
            Three layers of the same program.
          </h2>
          <p style={{ fontSize:15, color:"#4B5563", lineHeight:1.75, marginBottom:28, maxWidth:620 }}>
            This is not just an app. This is a system. Think of it as a funnel — breadth at the top, depth at the bottom. Every layer is a win.
          </p>

          {/* Three cards */}
          <div className="upd-model-grid" style={{ marginBottom:20 }}>
            {model.map((m, i) => (
              <div
                key={m.num}
                style={{
                  background: i === 0 ? orange : i === 1 ? navy : "#F9FAFB",
                  borderRadius:16,
                  padding:"28px 24px",
                  position:"relative",
                  border: i === 2 ? `1px solid #E5E7EB` : "none",
                }}
              >
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color: i === 0 ? "rgba(255,255,255,0.6)" : i === 1 ? "rgba(255,255,255,0.4)" : "#9CA3AF", marginBottom:6 }}>
                  {m.num}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color: i < 2 ? "#ffffff" : navy, letterSpacing:"-0.02em", marginBottom:4, lineHeight:1.1 }}>
                  {m.title}
                </div>
                <div style={{ fontSize:11, fontWeight:600, color: i === 0 ? "rgba(255,255,255,0.7)" : i === 1 ? orange : orange, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>
                  {m.sub}
                </div>
                <p style={{ fontSize:13, color: i < 2 ? "rgba(255,255,255,0.7)" : "#4B5563", lineHeight:1.65, margin:0, marginBottom:16 }}>
                  {m.desc}
                </p>
                <span style={{ display:"inline-block", background: i === 0 ? "rgba(255,255,255,0.2)" : i === 1 ? "rgba(232,80,10,0.2)" : "#FFF0EA", color: i < 2 ? "#ffffff" : orange, fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", padding:"4px 10px", borderRadius:100 }}>
                  {m.status}
                </span>
              </div>
            ))}
          </div>

          {/* Connector note */}
          <div style={{ background:"#F9FAFB", border:"1px solid #E5E7EB", borderRadius:12, padding:"18px 22px" }}>
            <p style={{ fontSize:14, color:"#6B7280", lineHeight:1.75, margin:0, fontStyle:"italic" }}>
              Most teens will only experience exposure. Some will have conversations. Even fewer will reach connections. That is by design. Every layer is a form of success.
            </p>
          </div>
        </section>

        {/* ── HOW WE REACH TEENS ── */}
        <section style={{ marginBottom:56 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>How we reach teens</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:24, lineHeight:1.15 }}>
            Two ways we reach teens.
          </h2>
          <div className="upd-two-col">
            {/* Block 1 */}
            <div style={{ background:navy, borderRadius:16, padding:"28px 24px" }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:orange, marginBottom:10 }}>Through organizations</div>
              <p style={{ fontSize:14, color:"rgba(255,255,255,0.7)", lineHeight:1.7, marginBottom:14 }}>
                We partner with nonprofits, schools, and youth-serving programs. When an org brings us in, teens pick their in-person guide — a mentor, a program leader, someone they already trust. That person becomes the adult in the conversation layer. We equip them. They do the talking.
              </p>
              <p style={{ fontSize:14, color:"rgba(255,255,255,0.7)", lineHeight:1.7, marginBottom:14 }}>
                Partners include Friends of the Children, EOYDC, Live in Peace, and Pivotal.
              </p>
              <p style={{ fontSize:14, color:"rgba(255,255,255,0.7)", lineHeight:1.7, marginBottom:0 }}>
                One of the most significant developments this year has been our partnership with juvenile detention centers through Fresh Lifelines for Youth. When I walked in and saw those teens light up in that room, I knew this was exactly where we needed to be. These are the teens most disconnected from any career pathway. And they are hungry for this.
              </p>
            </div>
            {/* Block 2 */}
            <div style={{ background:cream, border:`1px solid ${orange}25`, borderRadius:16, padding:"28px 24px" }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:orange, marginBottom:10 }}>For the adults in their corner</div>
              <div style={{ fontSize:13, fontWeight:600, color:navy, letterSpacing:"0.03em", marginBottom:14 }}>Parents. Coaches. Mentors.</div>
              <p style={{ fontSize:14, color:"#4B5563", lineHeight:1.7, marginBottom:14 }}>
                The adults who already have a relationship with a teen are our most powerful partners. We give them the tools — career conversation prompts, learning insights, and real-time visibility into what their teen is exploring — to turn an existing relationship into a career launchpad.
              </p>
              <p style={{ fontSize:14, color:"#4B5563", lineHeight:1.7, marginBottom:14 }}>
                Same app. A completely different experience built for the adult who shows up.
              </p>
              <p style={{ fontSize:14, color:"#4B5563", lineHeight:1.7, marginBottom:0 }}>
                Parents who find us through social media, coaches who want to bring meaning to practice, mentors looking for something real to work through together — we built this for them.
              </p>
            </div>
          </div>
        </section>

        {/* ── WHY NOW ── */}
        <section style={{ marginBottom:56 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>Why now</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:20, lineHeight:1.15 }}>
            The window is right now.
          </h2>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:20, maxWidth:680 }}>
            AI is restructuring the job market faster than any of us predicted. The careers that will survive are not the ones that can be automated. They are built on what makes us human.
          </p>

          {/* Skill chips */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:24 }}>
            {skills.map((s) => (
              <span key={s} style={{ background:cream, border:`1.5px solid ${orange}30`, color:orange, fontWeight:700, fontSize:13, padding:"8px 18px", borderRadius:100 }}>
                {s}
              </span>
            ))}
          </div>

          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:14, maxWidth:680 }}>
            These are the skills we are intentionally threading through every internship track, every conversation guide, every coaching session. We are not just giving teens career exposure. We are giving them the skills and the mindset that will make them employable in a world that looks nothing like the one their parents grew up in.
          </p>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, maxWidth:680 }}>
            The policy landscape is shifting too. DEI rollbacks. Reduced government investment in youth services. The erosion of school counseling. The systems meant to support teens from under-resourced communities are contracting. We are one of the organizations that can fill that gap. The question is not whether this works. We have the data. The question is whether we can build the infrastructure to scale it.
          </p>
        </section>

        {/* ── WHAT WE'RE BUILDING ── */}
        <section style={{ background:navy, borderRadius:20, padding:"40px 36px", marginBottom:40 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>What we&apos;re building in 2026</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:"#ffffff", marginBottom:10, lineHeight:1.15 }}>
            Our 2026 priorities.
          </h2>
          <p style={{ fontSize:15, color:"rgba(255,255,255,0.55)", lineHeight:1.7, marginBottom:28, maxWidth:580 }}>
            Take everything that works in the app and build the infrastructure that makes it spread.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12 }}>
            {priorities.map((p) => (
              <div key={p.num} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"20px 18px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:orange, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>{p.num}</div>
                <div style={{ fontSize:15, fontWeight:700, color:"#ffffff", marginBottom:8, lineHeight:1.3 }}>{p.title}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.65 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT SUCCESS LOOKS LIKE ── */}
        <section style={{ marginBottom:48 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>What success looks like</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:24, lineHeight:1.15 }}>
            By end of 2026.
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {goals.map((g, i) => (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:14, background:"#F9FAFB", border:"1px solid #E5E7EB", borderRadius:12, padding:"16px 20px" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:`${orange}15`, border:`1.5px solid ${orange}40`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke={orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ fontSize:15, color:"#374151", lineHeight:1.6, margin:0 }}>{g}</p>
              </div>
            ))}
          </div>
        </section>

        <div style={{ width:36, height:4, background:orange, borderRadius:2, marginBottom:48 }} />

        {/* ── THE ASK ── */}
        <section style={{ marginBottom:40 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:orange, marginBottom:12 }}>The ask</div>
          <h2 style={{ fontSize:"clamp(24px, 3.5vw, 36px)", fontWeight:800, letterSpacing:"-0.025em", color:navy, marginBottom:14, lineHeight:1.15 }}>
            Join the next chapter.
          </h2>
          <p style={{ fontSize:16, color:"#4B5563", lineHeight:1.75, marginBottom:28, maxWidth:640 }}>
            You are not funding an idea. You are funding a proven program at an inflection point. The app works. The data is real. The partners are ready. The need has never been greater. We are raising $1.2M in 2026 to fund this build-out.
          </p>

          {/* Tier cards */}
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
            {tiers.map((tier, i) => (
              <div key={tier.amount} style={{ border: tier.highlight ? `2px solid ${orange}` : "1px solid #E5E7EB", background: tier.highlight ? cream : "#ffffff", borderRadius:12, padding:"18px 20px", display:"flex", alignItems:"flex-start", gap:14, position:"relative" }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background: dotColors[i] ?? orange, flexShrink:0, marginTop:6 }} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:3 }}>
                    <span style={{ fontSize:20, fontWeight:800, color:navy, letterSpacing:"-0.02em" }}>{tier.amount}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:orange, textTransform:"uppercase", letterSpacing:"0.1em" }}>{tier.name}</span>
                    {tier.highlight && (
                      <span style={{ background:orange, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:100, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                        Most common this round
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize:13, color:"#6B7280", lineHeight:1.6, margin:0 }}>{tier.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Other ways in */}
          <div style={{ background:"#F3F4F6", borderRadius:12, padding:"22px 22px" }}>
            <div style={{ fontWeight:700, fontSize:14, color:navy, marginBottom:14 }}>Not in a position to give right now? Other ways in.</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {["Introduce us to a funder","Connect us to a corporate partner","Share your story with our teens","Host a small gathering","Join our advisory circle","Amplify our work"].map((tag) => (
                <span key={tag} style={{ background:"#ffffff", border:"1px solid #D1D5DB", borderRadius:100, padding:"5px 14px", fontSize:12, color:"#374151", fontWeight:500 }}>{tag}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── CLOSING CTA ── */}
        <section style={{ background:navy, borderRadius:20, padding:"52px 36px", textAlign:"center", marginBottom:60 }}>
          <div style={{ width:36, height:4, background:orange, borderRadius:2, margin:"0 auto 28px" }} />
          <h2 style={{ fontSize:"clamp(24px, 4vw, 40px)", fontWeight:800, color:"#ffffff", letterSpacing:"-0.025em", marginBottom:14, lineHeight:1.15 }}>
            Let&apos;s find 30 minutes.
          </h2>
          <p style={{ fontSize:16, color:"rgba(255,255,255,0.55)", lineHeight:1.7, maxWidth:520, margin:"0 auto 28px" }}>
            I want to share what is next and hear where you see yourself in it.
          </p>
          <a href="mailto:remi@ambitionangels.org" style={{ display:"inline-block", background:orange, color:"#ffffff", fontWeight:700, fontSize:15, padding:"14px 36px", borderRadius:100, textDecoration:"none", letterSpacing:"-0.01em", marginBottom:16 }}>
            Reply to Remi →
          </a>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.3)", margin:0 }}>remi@ambitionangels.org</p>
        </section>

        {/* FOOTER */}
        <footer style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", paddingTop:20, borderTop:"1px solid #F0EDE8" }}>
          <span style={{ fontSize:12, color:"#9CA3AF" }}>Remi Sobomehin, Founder</span>
        </footer>
      </main>
    </div>
  );
}
