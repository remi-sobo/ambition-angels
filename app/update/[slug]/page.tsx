import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Poppins } from "next/font/google";
import Image from "next/image";
import { donors, getDonorBySlug } from "@/lib/donors";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

type Props = {
  params: { slug: string };
};

export function generateStaticParams() {
  return donors.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const donor = getDonorBySlug(params.slug);
  if (!donor) return { title: "Not Found" };
  return { title: `Ambition Angels — Update for ${donor.name}` };
}

const tiers = [
  {
    amount: "$10,000",
    name: "Founding Partner",
    description:
      "Funds a full cohort of teens through one internship track. By the end, they know what a career actually feels like.",
  },
  {
    amount: "$25,000",
    name: "Content & Experience Partner",
    description:
      "Funds new internship track development and partner onboarding. Directly expands what teens can explore.",
  },
  {
    amount: "$50,000",
    name: "Student Access Partner",
    description:
      "Funds the Ambition Fund, our philanthropy-powered track for high-need teens without an existing support system.",
  },
  {
    amount: "$100,000",
    name: "School & Nonprofit Rollout Partner",
    description:
      "Funds the adult dashboard build-out and partner expansion. The infrastructure that makes scale possible.",
  },
  {
    amount: "$250,000",
    name: "Regional Anchor Partner",
    description:
      "Anchors our 2026 operating model. Takes us from early proof to repeatable system at Bay Area scale.",
  },
];

const stats = [
  { number: "3,526", label: "Teens reached" },
  { number: "36+", label: "Partners" },
  { number: "87%", label: "Title I schools" },
  { number: "74%", label: "Start a second course" },
  { number: "+14%", label: "Future Orientation Score" },
  { number: "1,038", label: "Monthly active users" },
];

const dotColors = ["#E8500A", "#1E2235", "#6B7280", "#374151", "#9CA3AF"];

export default function UpdatePage({ params }: Props) {
  const donor = getDonorBySlug(params.slug);
  if (!donor) notFound();

  const orange = "#E8500A";
  const navy = "#1E2235";
  const cream = "#FFF7F4";

  return (
    <div
      className={poppins.className}
      style={{
        background: "#ffffff",
        color: "#1a1a1a",
        minHeight: "100vh",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      {/* Responsive styles */}
      <style>{`
        .update-hero-grid {
          display: flex;
          flex-direction: row;
          gap: 48px;
          align-items: center;
        }
        .update-hero-text {
          flex: 1;
          min-width: 0;
        }
        .update-hero-photo {
          width: 380px;
          flex-shrink: 0;
          height: 420px;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
        }
        .update-app-grid {
          display: flex;
          flex-direction: row;
          gap: 48px;
          align-items: center;
        }
        .update-app-text {
          flex: 1;
          min-width: 0;
        }
        .update-photo-break {
          position: relative;
          width: 100%;
          height: 320px;
          border-radius: 16px;
          overflow: hidden;
          margin: 40px 0;
        }
        .update-photo-quote {
          font-size: 22px;
        }
        @media (max-width: 640px) {
          .update-hero-grid {
            flex-direction: column;
            gap: 28px;
          }
          .update-hero-photo {
            width: 100%;
            height: 260px;
            flex-shrink: unset;
          }
          .update-app-grid {
            flex-direction: column;
            gap: 32px;
          }
          .update-photo-break {
            height: 240px;
          }
          .update-photo-quote {
            font-size: 18px;
          }
        }
      `}</style>

      {/* NAV */}
      <nav
        style={{
          padding: "20px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #f0ede8",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo mark */}
          <div
            style={{
              background: orange,
              borderRadius: 10,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M7 17L17 7M17 7H8M17 7V16"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              color: navy,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Ambition Angels
          </span>
        </div>
        <span
          style={{
            color: "#9CA3AF",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Q2 2026 Update
        </span>
      </nav>

      {/* MAIN CONTENT */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px 80px" }}>

        {/* HERO — Change 1: two-column split with photo */}
        <section style={{ paddingTop: 64, paddingBottom: 48 }}>
          <div className="update-hero-grid">

            {/* Left: text */}
            <div className="update-hero-text">
              {/* Pill */}
              <div
                style={{
                  display: "inline-block",
                  background: "#FFF0EA",
                  border: `1px solid ${orange}30`,
                  color: orange,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "5px 14px",
                  borderRadius: 100,
                  marginBottom: 24,
                }}
              >
                A personal update for {donor.name}
              </div>

              <h1
                style={{
                  fontSize: "clamp(28px, 4.5vw, 48px)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.03em",
                  color: navy,
                  marginBottom: 16,
                }}
              >
                We know it works.{" "}
                <span style={{ color: orange }}>Now we scale it.</span>
              </h1>

              {donor.gave && donor.gaveAmount && donor.gaveYear && (
                <p
                  style={{
                    fontSize: 15,
                    color: orange,
                    fontWeight: 600,
                    marginBottom: 12,
                    fontStyle: "italic",
                  }}
                >
                  Your {donor.gaveAmount} gift in {donor.gaveYear} is part of what made this next chapter possible.
                </p>
              )}

              <p
                style={{
                  fontSize: 16,
                  color: "#4B5563",
                  lineHeight: 1.7,
                  marginBottom: 16,
                }}
              >
                The career landscape is shifting faster than most adults can track, let alone teenagers. Here&apos;s where we are, what we&apos;ve built, and where we&apos;re going next.
              </p>

              {/* Personal note */}
              <p
                style={{
                  fontSize: 15,
                  color: "#6B7280",
                  lineHeight: 1.7,
                  fontStyle: "italic",
                  borderLeft: `3px solid ${orange}40`,
                  paddingLeft: 16,
                }}
              >
                {donor.personalNote}
              </p>
            </div>

            {/* Right: photo */}
            <div className="update-hero-photo">
              <Image
                src="/images/jonas-leupe-wK-elt11pF0-unsplash.jpg"
                alt="Teen looking at their phone"
                fill
                priority
                style={{ objectFit: "cover", objectPosition: "center" }}
              />
            </div>

          </div>
        </section>

        {/* DIVIDER */}
        <div style={{ width: 36, height: 4, background: orange, borderRadius: 2, marginBottom: 48 }} />

        {/* WHERE WE ARE */}
        <section style={{ marginBottom: 56 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: orange,
              marginBottom: 12,
            }}
          >
            Where we are
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: navy,
              marginBottom: 20,
              lineHeight: 1.15,
            }}
          >
            The model is working. The need is urgent.
          </h2>
          <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.75, marginBottom: 12, maxWidth: 680 }}>
            We launched Ambition to solve a specific problem: teens from low-income communities graduate knowing academic subjects but not how to navigate a workforce changing faster than any curriculum can keep up with. Our answer was to meet them on the device they already use for 8 hours a day.
          </p>
          <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.75, marginBottom: 32, maxWidth: 680 }}>
            Two years in, the engagement data tells a clear story. Teens are showing up. They&apos;re finishing. And they&apos;re coming back. The question has shifted from &ldquo;does this work?&rdquo; to &ldquo;how fast can we build it out?&rdquo;
          </p>

          {/* Stat cards — 2 rows of 3 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: cream,
                  border: `1px solid ${orange}25`,
                  borderRadius: 12,
                  padding: "20px 16px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: orange,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    marginBottom: 6,
                  }}
                >
                  {stat.number}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#9CA3AF",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* APP SECTION — Change 2: new section after stats, before quote */}
        <section style={{ marginBottom: 56 }}>
          <div className="update-app-grid">

            {/* Left: text */}
            <div className="update-app-text">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: orange,
                  marginBottom: 12,
                }}
              >
                What teens do on the app
              </div>
              <h2
                style={{
                  fontSize: "clamp(22px, 3vw, 32px)",
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                  color: navy,
                  marginBottom: 16,
                  lineHeight: 1.2,
                }}
              >
                They don&apos;t just learn about careers. They try them.
              </h2>
              <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.75, margin: 0 }}>
                On the Ambition App, students complete 30-day simulated internships across business, STEM, arts, health, and more. 15 minutes a day. Real tasks. Real skills. Real rewards. By the end of 30 days, they know what a career actually feels like.
              </p>
            </div>

            {/* Right: CSS phone frame with app screenshot */}
            <div style={{ display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <div
                style={{
                  background: "#1a1a1a",
                  borderRadius: 44,
                  padding: 14,
                  width: 200,
                  flexShrink: 0,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
                }}
              >
                {/* Notch */}
                <div
                  style={{
                    width: 70,
                    height: 20,
                    background: "#1a1a1a",
                    borderRadius: 10,
                    margin: "0 auto 10px auto",
                  }}
                />
                {/* Screen */}
                <div style={{ borderRadius: 32, overflow: "hidden" }}>
                  <Image
                    src="/images/app_mockup.png"
                    alt="Ambition App internship tracks"
                    width={390}
                    height={844}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* QUOTE BLOCK */}
        <blockquote
          style={{
            borderLeft: `4px solid ${orange}`,
            background: cream,
            borderRadius: "0 12px 12px 0",
            padding: "24px 28px",
            marginBottom: 56,
          }}
        >
          <p
            style={{
              fontSize: 18,
              fontStyle: "italic",
              color: navy,
              fontWeight: 500,
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            &ldquo;I didn&apos;t know this existed. I think I might want to do this.&rdquo;
          </p>
          <cite
            style={{
              fontSize: 12,
              color: "#9CA3AF",
              fontStyle: "normal",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Teen on the Ambition App after completing her first internship track.
          </cite>
        </blockquote>

        {/* DIVIDER */}
        <div style={{ width: 36, height: 4, background: orange, borderRadius: 2, marginBottom: 48 }} />

        {/* WHAT MAKES THIS WORK — Change 4: heading updated */}
        <section style={{ marginBottom: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: orange,
              marginBottom: 12,
            }}
          >
            What makes this work.
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: navy,
              marginBottom: 20,
              lineHeight: 1.15,
            }}
          >
            Teens engage when a trusted adult is in the room.
          </h2>
          <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.75, marginBottom: 14, maxWidth: 680 }}>
            We built Ambition to go directly to teens. And we were right that the phone was the channel. But we learned something critical along the way: the teens who complete internships and actually shift their career thinking are almost always connected to an adult who knows they&apos;re doing it. A counselor. A coach. A mentor. Someone in the room.
          </p>
          <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.75, maxWidth: 680 }}>
            That insight is reshaping everything we&apos;re building in 2026. The app does the work. The adult makes it stick.
          </p>
        </section>

        {/* FULL-WIDTH PHOTO BREAK — Change 3: between "what makes this work" and dark priorities */}
        <div className="update-photo-break">
          <Image
            src="/images/derick-anies-hDJT_ERrB-w-unsplash.jpg"
            alt="Teen with ambition"
            fill
            style={{ objectFit: "cover", objectPosition: "center top" }}
          />
          {/* Dark overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(30,34,53,0.65)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 24px",
            }}
          >
            <p
              className="update-photo-quote"
              style={{
                fontFamily: "Poppins, sans-serif",
                fontStyle: "italic",
                color: "#ffffff",
                fontWeight: 700,
                maxWidth: 560,
                textAlign: "center",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              &ldquo;Their ambition hasn&apos;t been turned on yet. When it is, they&apos;ll run through a wall.&rdquo;
            </p>
            {/* Orange divider line */}
            <div
              style={{
                width: 36,
                height: 3,
                background: orange,
                borderRadius: 2,
                marginTop: 16,
              }}
            />
          </div>
        </div>

        {/* WHAT WE'RE BUILDING — dark navy */}
        <section
          style={{
            background: navy,
            borderRadius: 20,
            padding: "40px 36px",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: orange,
              marginBottom: 12,
            }}
          >
            What we&apos;re building in 2026
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: "#ffffff",
              marginBottom: 10,
              lineHeight: 1.15,
            }}
          >
            The adult layer is the unlock.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 28, maxWidth: 580 }}>
            Four priorities. One goal: take everything that works in the app and build the infrastructure that makes it spread.
          </p>

          {/* 2x2 grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {[
              {
                priority: "Priority 01",
                title: "Adult-led Platform",
                desc: "A dashboard for counselors, coaches, and program directors to assign internships, track progress, and see outcomes in real time.",
              },
              {
                priority: "Priority 02",
                title: "Content Expansion",
                desc: "New internship tracks in high-growth fields, built with employer and industry partners to reflect what the market actually needs.",
              },
              {
                priority: "Priority 03",
                title: "Ambition Coaches",
                desc: "A trained cohort of near-peer coaches embedded in schools and nonprofits who use the app as their core curriculum tool.",
              },
              {
                priority: "Priority 04",
                title: "Opportunity Board",
                desc: "A curated feed of real internships, trade programs, and entry-level roles matched to each student by career path and location.",
              },
            ].map((item) => (
              <div
                key={item.priority}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: "20px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: orange,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {item.priority}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#ffffff",
                    marginBottom: 8,
                    lineHeight: 1.3,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.65,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* WHY NOW callout */}
        <div
          style={{
            background: cream,
            border: `1px solid ${orange}30`,
            borderRadius: 14,
            padding: "28px 28px",
            marginBottom: 48,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: navy,
              marginBottom: 10,
            }}
          >
            Why now.
          </div>
          <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.75, margin: 0 }}>
            AI is reshaping careers faster than schools can respond. Half the jobs that exist today will look fundamentally different in five years. Meanwhile, 95% of teens are on their phones and less than 11% attend any after-school programming. The window to build something that actually scales is right now. We have the proof. We have the model. We need the capital to move.
          </p>
        </div>

        {/* DIVIDER */}
        <div style={{ width: 36, height: 4, background: orange, borderRadius: 2, marginBottom: 48 }} />

        {/* HOW YOU CAN HELP */}
        <section style={{ marginBottom: 40 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: orange,
              marginBottom: 12,
            }}
          >
            How you can help
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: navy,
              marginBottom: 14,
              lineHeight: 1.15,
            }}
          >
            Join the next chapter.
          </h2>
          <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.75, marginBottom: 28, maxWidth: 620 }}>
            We&apos;re raising $1.2M in 2026 to fund this build-out. Philanthropy is the bridge from early proof to scalable system. Here&apos;s where people are stepping in.
          </p>

          {/* Tier cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {tiers.map((tier, i) => {
              const isHighlighted = tier.amount === donor.highlightTier;
              return (
                <div
                  key={tier.amount}
                  style={{
                    border: isHighlighted ? `2px solid ${orange}` : "1px solid #E5E7EB",
                    background: isHighlighted ? cream : "#ffffff",
                    borderRadius: 12,
                    padding: "18px 20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    position: "relative",
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: dotColors[i] ?? orange,
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 3 }}>
                      <span
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: navy,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {tier.amount}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: orange,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {tier.name}
                      </span>
                      {isHighlighted && (
                        <span
                          style={{
                            background: orange,
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 100,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          Most common this round
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>
                      {tier.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Soft commit note */}
          {donor.softCommitNote && (
            <div
              style={{
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 28,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  fontStyle: "italic",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {donor.softCommitNote}
              </p>
            </div>
          )}

          {/* Non-monetary box */}
          <div
            style={{
              background: "#F3F4F6",
              borderRadius: 12,
              padding: "22px 22px",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: navy,
                marginBottom: 14,
              }}
            >
              Not in a position to give right now? Other ways in.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                "Introduce us to a funder",
                "Connect us to a corporate partner",
                "Share your story with our teens",
                "Host a small gathering",
                "Join our advisory circle",
                "Amplify our work",
              ].map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #D1D5DB",
                    borderRadius: 100,
                    padding: "5px 14px",
                    fontSize: 12,
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA BLOCK */}
        <section
          style={{
            background: navy,
            borderRadius: 20,
            padding: "52px 36px",
            textAlign: "center",
            marginBottom: 60,
          }}
        >
          {/* Small orange line */}
          <div
            style={{
              width: 36,
              height: 4,
              background: orange,
              borderRadius: 2,
              margin: "0 auto 28px",
            }}
          />
          <h2
            style={{
              fontSize: "clamp(24px, 4vw, 40px)",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.025em",
              marginBottom: 14,
              lineHeight: 1.15,
            }}
          >
            Let&apos;s find 30 minutes.
          </h2>
          <p
            style={{
              fontSize: 16,
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.7,
              maxWidth: 520,
              margin: "0 auto 28px",
            }}
          >
            Reply to my email and we&apos;ll set something up. I want to share what&apos;s next and hear where you see yourself in it.
          </p>
          <a
            href="mailto:remi@ambitionangels.org"
            style={{
              display: "inline-block",
              background: orange,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 15,
              padding: "14px 36px",
              borderRadius: 100,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              marginBottom: 16,
            }}
          >
            Reply to Remi
          </a>
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.3)",
              margin: 0,
            }}
          >
            remi@ambitionangels.org
          </p>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 20,
            borderTop: "1px solid #F0EDE8",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#D1D5DB" }}>
            ambition-angels.vercel.app/update/{donor.slug}
          </span>
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>
            Remi Sobomehin, Founder
          </span>
        </footer>
      </main>
    </div>
  );
}
