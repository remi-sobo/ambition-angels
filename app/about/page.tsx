/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Image from "next/image";
export const metadata: Metadata = {
  title: "About",
  description:
    "Ambition Angels is a youth development organization building a real path to careers through career exposure, in the classroom and in their pocket.",
};

const boardMembers = [
  {
    name: "Remi Sobomehin",
    org: "Ambition Angels",
    title: "CEO",
    photo: "/images/Remi-Sobomehin_edited_edited.jpeg",
    linkedin: "https://www.linkedin.com/in/remi-sobomehin/",
  },
  {
    name: "Jerrel Brown",
    org: "Dapper Down Lounge",
    title: "CEO",
    photo: "/images/Jerrell B.jpeg",
    linkedin: "https://www.linkedin.com/in/jerrel-brown-b54410ab/",
  },
  {
    name: "Lara Sellers",
    org: "",
    title: "Educational Advocate",
    photo: "/images/Lara.jpeg",
    linkedin: "https://www.linkedin.com/in/lara-sellers-a138391a/",
  },
  {
    name: "Michelle Vilchez",
    org: "Innovate Public Schools",
    title: "CEO",
    photo: "/images/Michelle.jpg",
    linkedin: "https://www.linkedin.com/in/michelle-vilchez-152684b/",
  },
  {
    name: "Todd Singleton",
    org: "Microsoft",
    title: "General Manager",
    photo: "/images/Todd.jpeg",
    linkedin: "https://www.linkedin.com/in/todd-singleton/",
  },
];

const advisors = [
  { name: "Charles Best", org: "DonorsChoose", title: "Founder", photo: "/images/Charles.jpg", linkedin: "https://www.linkedin.com/in/charlesdbest/" },
  { name: "Meg Garlinghouse", org: "LinkedIn", title: "VP, Social Impact", photo: "/images/meg.jpg", linkedin: "https://www.linkedin.com/in/meggarlinghouse/" },
  { name: "Shamar Edwards", org: "Alameda Unified", title: "Senior Director", photo: "/images/shamar 2.jpeg", linkedin: "https://www.linkedin.com/in/shamar-edwards-949603b0/" },
  { name: "Lorne Needle", org: "X, the moonshot factory", title: "Head of People and Culture", photo: "/images/lorne.jpg", linkedin: "https://www.linkedin.com/in/lorne-needle-383a362/" },
  { name: "Jerrell Jimmerson", org: "Disney Streaming", title: "CPO", photo: "/images/jerrell.jpeg", linkedin: "https://www.linkedin.com/in/jerrelljimerson/" },
  { name: "Neil Bellefeuille", org: "BILD", title: "Partner", photo: "/images/Neil_edited.jpg", linkedin: "https://www.linkedin.com/in/neil-bellefeuille/" },
  { name: "Bob Burlinson", org: "Regis Management", title: "Co-Founder / Partner", photo: "/images/bobb_edited.jpg", linkedin: "https://www.linkedin.com/in/bob-burlinson-912ab6/" },
  { name: "Lesley Martin", org: "Former Principal", title: "Education Consultant", photo: "/images/lesley.jpg", linkedin: "https://www.linkedin.com/in/lesley-martin-babba92b/" },
  { name: "Sean Mendy", org: "Concrete Rose Capital", title: "Founding Partner", photo: "/images/sean mendy.jpeg", linkedin: "https://www.linkedin.com/in/seanmendy/" },
  { name: "Shawn Parr", org: "Envoy", title: "Managing Director", photo: "/images/shawn-parr.png", linkedin: "https://www.linkedin.com/in/sparr1/" },
  { name: "Jeff Camarillo", org: "Stanford GSE", title: "STEP Director", photo: "/images/jeff-camarillo.jpg", linkedin: "https://www.linkedin.com/in/jeff-benjamin-camarillo-6274b02a4/" },
  { name: "Preston Smith", org: "Rocketship Public Schools", title: "Co-Founder and CEO", photo: "/images/Preston.jpg", linkedin: "https://www.linkedin.com/in/smithpreston/" },
  { name: "Jason Mayden", org: "The Speed of Grace", title: "Designer and Author", photo: "/images/jason mayden.jpg", linkedin: "https://www.linkedin.com/in/jasonmayden/" },
  { name: "Terri Givens", org: "McGill University", title: "Professor of Political Science", photo: "/images/Terri.jpg", linkedin: "https://www.linkedin.com/in/terrigivens/" },
  { name: "Eugene Clark-Herrera", org: "Orrick LLP", title: "Partner", photo: "/images/Eugene.jpg", linkedin: "https://www.linkedin.com/in/eugene-clark-herrera-7b040b/" },
  { name: "Dr. Alan Schroeder", org: "Lucile Packard Children's Hospital Stanford", title: "Assoc. Chief for Research", photo: "/images/alan.jpg", linkedin: "https://www.linkedin.com/in/alan-schroeder-36b63613/" },
  { name: "Heather Starnes-Logwood", org: "Live In Peace", title: "Executive Director", photo: "/images/heather.jpg", linkedin: "https://www.linkedin.com/in/heather-starnes-logwood/" },
  { name: "Dr. Ryan Padrez", org: "Stanford School of Medicine", title: "Clinical Associate Professor in Pediatrics", photo: "/images/Ryan.jpg", linkedin: "https://www.linkedin.com/in/ryan-padrez-64518134/" },
  { name: "Mallory Dwinal-Palisch", org: "Reach University", title: "Chancellor", photo: "/images/mallory.jpeg", linkedin: "https://www.linkedin.com/in/mallory-dwinal-palisch/" },
  { name: "Olatunde Sobomehin", org: "Streetcode Academy", title: "CEO", photo: "/images/tunde.jpg", linkedin: "https://www.linkedin.com/in/coachtunde/" },
  { name: "Dr. Bryan Brown", org: "Stanford GSE", title: "Professor", photo: "/images/bryan.jpeg", linkedin: "https://www.linkedin.com/in/bryan-brown-a0744516/" },
  { name: "Julie Lythcott-Haims", org: "", title: "New York Times bestselling author of How to Raise an Adult", photo: "/images/julie.jpeg", linkedin: "https://www.linkedin.com/in/jlythcotthaims/" },
];

const board = boardMembers.map((m) => ({ ...m, role: m.title }));
const advisorCards = advisors.map((a) => ({ ...a, line: a.org ? `${a.title}, ${a.org}` : a.title }));

export default function AboutPage() {
  return (
    <>
      <div className="aa-page" style={{ fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", overflowX: "clip" }}>
        <section style={{ position: "relative", background: "var(--cream)", overflow: "hidden" }}>
          <img src="/images/site/doodles/doodle-62.png" alt="" aria-hidden="true" style={{ position: "absolute", top: "56px", right: "7%", width: "120px", opacity: "0.35", pointerEvents: "none" }} />
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(80px,10vw,136px) clamp(20px,4vw,32px) clamp(64px,8vw,104px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 20px" }}>About Us</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(60px,9vw,132px)", lineHeight: "0.88", letterSpacing: "-0.015em", color: "var(--ink)", margin: "0 0 28px" }}>
              <span style={{ display: "block" }}>Every young person.</span>
              <span style={{ display: "block", color: "var(--orange)" }}>A real path.</span>
            </h1>
            <p style={{ fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.6", color: "var(--charcoal)", maxWidth: "640px", margin: "0", textWrap: "pretty" }}>Every young person deserves a clear picture of what is possible and a real path to get there. Ambition Angels is a youth development organization building that path through real career exposure, in the classroom and in their pocket.</p>
          </div>
        </section>
        <section style={{ background: "var(--ink)", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,120px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "clamp(48px,6vw,96px)", alignItems: "start" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Where we came from</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", fontSize: "clamp(48px,5.6vw,88px)", lineHeight: "0.9", letterSpacing: "-0.015em", color: "var(--cream)", margin: "0 0 36px" }}>
                {"This is not theory. "}
                <span style={{ color: "var(--orange)" }}>This is our story.</span>
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "16px", maxWidth: "440px" }}>
                <figure style={{ margin: "0" }}>
                  <Image src="/images/Remi-Sobomehin_edited_edited.jpg" width={2002} height={1609} sizes="(max-width: 768px) 50vw, 300px" alt="Remi Sobomehin" style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: "var(--radius-card)", display: "block" }} />
                  <figcaption style={{ marginTop: "10px" }}>
                    <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", color: "var(--cream)" }}>Remi Sobomehin</span>
                    <span style={{ fontSize: "13px", color: "var(--gray-mid)" }}>Founder & CEO</span>
                  </figcaption>
                </figure>
                <figure style={{ margin: "0" }}>
                  <Image src="/images/deme_edited.jpg" width={841} height={638} sizes="(max-width: 768px) 50vw, 300px" alt="Demetric Sanders" style={{ width: "100%", aspectRatio: "4/5", objectFit: "cover", borderRadius: "var(--radius-card)", display: "block" }} />
                  <figcaption style={{ marginTop: "10px" }}>
                    <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", color: "var(--cream)" }}>Demetric Sanders</span>
                    <span style={{ fontSize: "13px", color: "var(--gray-mid)" }}>Tech Partner</span>
                  </figcaption>
                </figure>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "560px" }}>
              <p style={{ fontSize: "18px", lineHeight: "1.7", color: "var(--gray-mid)", margin: "0" }}>{"Remi Sobomehin and Demetric Sanders grew up together in Portland, Oregon, both attending Remi's father's community nonprofit as kids. They grew up in low-income neighborhoods with no roadmap and decided on Stanford anyway. Youth workers and community organizations showed up for them for years. They both got in."}</p>
              <p style={{ fontSize: "18px", lineHeight: "1.7", color: "var(--gray-mid)", margin: "0" }}>After graduating, Remi went to East Palo Alto and got to work, leading in schools and nonprofits, trying to replicate what had worked for him and Demetric. He kept running into the same wall: he could not get teens to show up.</p>
              <p style={{ fontSize: "18px", lineHeight: "1.7", color: "var(--gray-mid)", margin: "0" }}>Meanwhile, Demetric joined Facebook and worked on the product team focused on teens. He could see exactly what was reaching them at scale. Their phones.</p>
              <p style={{ fontSize: "18px", lineHeight: "1.7", color: "var(--gray-mid)", margin: "0" }}>{"So they built for the phone, and then kept building. Today Ambition runs on the web in classrooms and programs, on the phone everywhere else, with a dashboard for every adult in a young person's corner."}</p>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: "900", textTransform: "uppercase", letterSpacing: "-0.01em", fontSize: "clamp(30px,3vw,44px)", lineHeight: "0.95", color: "var(--cream)", margin: "16px 0 0", paddingTop: "24px", borderTop: "1px solid rgb(250 250 248 / 0.14)" }}>
                {"Stop fighting where teens are. "}
                <span style={{ color: "var(--orange)" }}>Meet them there, and bring the adults with you.</span>
              </p>
            </div>
          </div>
        </section>
        <section style={{ background: "var(--paper)", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0 0 40px", color: "var(--ink)" }}>Our board of directors</h2>
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))", gap: "20px" }}>
              {board.map((p, i) => (
                <li key={i} style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <Image src={p.photo} alt="" width={144} height={144} sizes="72px" style={{ width: "72px", height: "72px", flexShrink: "0", borderRadius: "50%", objectFit: "cover", background: "var(--gray-light)" }} />
                  <span>
                    <a className="hv-7ccd06" href={p.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "17px", color: "var(--ink)" }}>{p.name}</a>
                    <span style={{ display: "block", fontSize: "14px", lineHeight: "1.45", color: "var(--charcoal)" }}>{p.role}</span>
                    <span style={{ display: "block", fontSize: "14px", lineHeight: "1.45", color: "var(--muted)" }}>{p.org}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section style={{ background: "var(--surface-tint)", backgroundImage: "radial-gradient(circle, rgba(232,80,10,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px", padding: "clamp(80px,9vw,112px) 0" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 clamp(20px,4vw,32px)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px 48px", marginBottom: "40px" }}>
              <div style={{ maxWidth: "640px" }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: "600", fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--orange)", margin: "0 0 16px" }}>Our advisors</p>
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "clamp(30px,3.6vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.15", margin: "0", color: "var(--ink)" }}>{advisorCards.length} leaders in education, tech, and social impact.</h2>
              </div>
              <p style={{ fontSize: "17px", lineHeight: "1.6", color: "var(--charcoal)", margin: "0", maxWidth: "440px" }}>Our advisory board includes founders, executives, professors, and practitioners who bring real-world expertise and a genuine commitment to building opportunity for low-income youth.</p>
            </div>
            <ul style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: "12px" }}>
              {advisorCards.map((a, i) => (
                <li key={i} style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: "var(--radius-card)", padding: "16px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
                  <Image src={a.photo} alt="" width={88} height={88} sizes="44px" style={{ width: "44px", height: "44px", flexShrink: "0", borderRadius: "50%", objectFit: "cover", background: "var(--gray-light)" }} />
                  <span style={{ minWidth: "0" }}>
                    <a className="hv-7ccd06" href={a.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: "700", fontSize: "15px", color: "var(--ink)" }}>{a.name}</a>
                    <span style={{ display: "block", fontSize: "13px", lineHeight: "1.4", color: "var(--muted)" }}>{a.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
