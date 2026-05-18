"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";

// Fonts are loaded at the root layout (next/font) and exposed as CSS
// variables. We just reference the Tailwind utilities that point at them:
// font-heading -> Poppins (var --font-heading)
// font-display -> Big Shoulders Display (var --font-display)
// font-body    -> DM Sans (var --font-body)

// ─────────────────────────────────────────────────────────
// Brand tokens, pulled from /update page
// ─────────────────────────────────────────────────────────
const ORANGE = "#E8500A";
const ORANGE_DARK = "#B83D06";
const ORANGE_LIGHT = "#FFF0EA";
const NAVY = "#1E2235";
const CREAM = "#FFF7F4";
const INK = "#0E0E0E";
const MUTED = "#9CA3AF";
const TEXT = "#374151";
const SOFT = "#4B5563";

// Coach kid video. Hosted on Google Drive.
// Swap GOOGLE_DRIVE_FILE_ID if the video moves to YouTube or elsewhere.
const GOOGLE_DRIVE_FILE_ID = "1aeVcnuNHSs356Hk5Zk5OMch5FGSEsBVt";
const VIDEO_EMBED_URL = `https://drive.google.com/file/d/${GOOGLE_DRIVE_FILE_ID}/preview`;
const VIDEO_WATCH_URL = `https://drive.google.com/file/d/${GOOGLE_DRIVE_FILE_ID}/view`;

const TOTAL_SLIDES = 14;
const VIDEO_SLIDE_INDEX = 2;
const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.45;

// ─────────────────────────────────────────────────────────
// Slide layout primitives
// ─────────────────────────────────────────────────────────
function Slide({
  children,
  className = "",
  align = "center",
}: {
  children: ReactNode;
  className?: string;
  align?: "center" | "top";
}) {
  const justify = align === "top" ? "justify-start pt-[10vh]" : "justify-center";
  return (
    <div
      className={`relative w-full min-h-screen flex flex-col ${justify} items-center px-6 md:px-16 py-16 ${className}`}
    >
      <div className="w-full max-w-[1180px] mx-auto">{children}</div>
    </div>
  );
}

function Overline({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[11px] md:text-xs font-bold uppercase tracking-[0.18em] text-center mb-6"
      style={{ color: ORANGE }}
    >
      {children}
    </div>
  );
}

function ItalicLine({ children }: { children: ReactNode }) {
  return (
    <p
      className="italic text-center text-base md:text-lg mt-10 mx-auto"
      style={{ color: SOFT, maxWidth: 720, lineHeight: 1.6 }}
    >
      {children}
    </p>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-center font-extrabold tracking-tight"
      style={{
        color: NAVY,
        fontSize: "clamp(28px, 4.5vw, 52px)",
        lineHeight: 1.1,
        letterSpacing: "-0.025em",
      }}
    >
      {children}
    </h2>
  );
}

function Subhead({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-center mt-5 mx-auto"
      style={{
        color: SOFT,
        fontSize: "clamp(15px, 1.6vw, 18px)",
        lineHeight: 1.6,
        maxWidth: 720,
      }}
    >
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────
// Individual slides
// ─────────────────────────────────────────────────────────

// 1. COVER
function SlideCover() {
  return (
    <Slide>
      <div className="text-center">
        <div
          className="text-xs md:text-sm font-bold uppercase tracking-[0.28em] mb-10"
          style={{ color: ORANGE }}
        >
          Prepared for
        </div>
        <h1
          className="font-display"
          style={{
            color: NAVY,
            fontSize: "clamp(44px, 7.5vw, 96px)",
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            fontWeight: 800,
            textTransform: "uppercase",
          }}
        >
          Jim Koshland
          <br />
          <span style={{ color: ORANGE }}>&amp; the Koshland Foundation</span>
        </h1>
        <p
          className="mt-10 mx-auto"
          style={{
            color: SOFT,
            fontSize: "clamp(18px, 2vw, 24px)",
            lineHeight: 1.5,
            maxWidth: 760,
            fontWeight: 400,
          }}
        >
          Three years in. What you built. What comes next.
        </p>
        <div
          className="mt-20 text-xs md:text-sm uppercase tracking-[0.18em]"
          style={{ color: MUTED, fontWeight: 600 }}
        >
          A conversation. May 18, 2026. Coffeebar, Menlo Park.
        </div>
        <div
          className="mt-3 text-[11px] uppercase tracking-[0.22em]"
          style={{ color: ORANGE, fontWeight: 700 }}
        >
          Palo Alto to Oakland.
        </div>
      </div>
    </Slide>
  );
}

// 2. NOTE FROM REMI
function SlideNote() {
  const para: React.CSSProperties = {
    color: TEXT,
    fontSize: "clamp(17px, 1.6vw, 22px)",
    lineHeight: 1.7,
    marginBottom: 22,
  };
  return (
    <Slide>
      <div className="mx-auto" style={{ maxWidth: 640 }}>
        <p style={para}>
          Jim, three years ago you bet on a small team and an idea. That teens
          would learn careers on the phones they already carried, if we made it
          feel like real work. You did not ask for a perfect plan. You asked
          for milestones and results.
        </p>
        <p style={para}>
          Three years in, I can tell you what we learned. The product works.
          And it works exponentially better when there is an adult in the
          loop. That is the hypothesis your investment let us test. Both
          halves now have data behind them.
        </p>
        <p style={{ ...para, marginBottom: 28 }}>
          Before any numbers, watch this. It is one of our first Coach pilot
          kids. He is what the second half of the bet looks like in practice.
        </p>
        <p
          className="italic"
          style={{
            color: NAVY,
            fontSize: 18,
            fontWeight: 500,
            margin: 0,
          }}
        >
          Remi.
        </p>
      </div>
    </Slide>
  );
}

// 3. THE VIDEO
function SlideVideo() {
  return (
    <Slide>
      <Overline>Meet one of our first Coach kids</Overline>
      <p
        className="text-center mx-auto mb-10"
        style={{
          color: SOFT,
          fontSize: "clamp(16px, 1.7vw, 19px)",
          lineHeight: 1.6,
          maxWidth: 820,
        }}
      >
        He found his path on the app. We paired him with a pro in his field
        for four sessions. This is what happened.
      </p>
      <div
        className="mx-auto rounded-2xl overflow-hidden"
        style={{
          maxWidth: 1100,
          width: "100%",
          aspectRatio: "16 / 9",
          boxShadow:
            "0 30px 60px -20px rgba(14,14,14,0.30), 0 0 0 1px rgba(232,80,10,0.10)",
          background: NAVY,
        }}
      >
        <iframe
          title="Ambition Coach pilot. First conversation."
          src={VIDEO_EMBED_URL}
          width="100%"
          height="100%"
          style={{ border: 0, display: "block" }}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      </div>
      <noscript>
        <p className="text-center mt-4 text-xs" style={{ color: SOFT }}>
          Watch the video at <a href={VIDEO_WATCH_URL}>{VIDEO_WATCH_URL}</a>
        </p>
      </noscript>
    </Slide>
  );
}

// 4. QUOTE
function SlideQuote() {
  return (
    <Slide>
      <div className="text-center mx-auto" style={{ maxWidth: 980 }}>
        <p
          className="italic"
          style={{
            color: NAVY,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(32px, 5vw, 64px)",
            lineHeight: 1.2,
            letterSpacing: "-0.015em",
            fontWeight: 400,
          }}
        >
          &ldquo;Amazing sessions. I got a lot of clarity on my plan
          forward.&rdquo;
        </p>
        <div
          className="mt-14 text-[11px] uppercase tracking-[0.28em]"
          style={{ color: MUTED, fontWeight: 700 }}
        >
          The next chapter. It is already built.
        </div>
      </div>
    </Slide>
  );
}

// 5. THE HYPOTHESIS
function SlideHypothesis() {
  const cardBase: React.CSSProperties = {
    borderRadius: 20,
    padding: "36px 32px",
    minHeight: 360,
    display: "flex",
    flexDirection: "column",
  };
  return (
    <Slide>
      <H2>The hypothesis your investment funded.</H2>
      <Subhead>Two halves. Both with data behind them now.</Subhead>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12"
        style={{ maxWidth: 1040, marginLeft: "auto", marginRight: "auto" }}
      >
        {/* Left: PROVEN */}
        <div
          style={{
            ...cardBase,
            background: "#ffffff",
            border: `1px solid ${ORANGE}35`,
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-4"
            style={{ color: ORANGE, fontWeight: 700 }}
          >
            Half one
          </div>
          <h3
            className="font-extrabold"
            style={{
              color: NAVY,
              fontSize: "clamp(22px, 2.6vw, 30px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            The product itself.
          </h3>
          <p
            style={{
              color: SOFT,
              fontSize: 16,
              lineHeight: 1.65,
              marginBottom: 24,
              flex: 1,
            }}
          >
            A career-exposure platform that meets teens on the phone they
            already have. Fifteen minutes a day. Real internships. Real
            rewards.
          </p>
          <span
            className="inline-block self-start text-[11px] uppercase tracking-[0.18em] rounded-full px-3 py-1"
            style={{
              color: "#ffffff",
              background: ORANGE,
              fontWeight: 700,
            }}
          >
            Proven.
          </span>
        </div>

        {/* Right: BEING BUILT */}
        <div
          style={{
            ...cardBase,
            background: CREAM,
            border: `1px solid ${ORANGE}20`,
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] mb-4"
            style={{ color: MUTED, fontWeight: 700 }}
          >
            Half two
          </div>
          <h3
            className="font-extrabold"
            style={{
              color: NAVY,
              fontSize: "clamp(22px, 2.6vw, 30px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            The adults around them.
          </h3>
          <p
            style={{
              color: SOFT,
              fontSize: 16,
              lineHeight: 1.65,
              marginBottom: 24,
              flex: 1,
            }}
          >
            A village model where every parent, mentor, coach, and counselor
            becomes a customized career advisor for the teen they love.
            Powered by AI generating personalized conversation guides for
            each kid.
          </p>
          <span
            className="inline-block self-start text-[11px] uppercase tracking-[0.18em] rounded-full px-3 py-1"
            style={{
              color: NAVY,
              background: "#E5E7EB",
              fontWeight: 700,
            }}
          >
            Being built.
          </span>
        </div>
      </div>

      <ItalicLine>What follows is the data on both.</ItalicLine>
    </Slide>
  );
}

// 6. TIMELINE
function SlideTimeline() {
  const nodes = [
    {
      year: "2023",
      amount: "Initial grant",
      body: "Build the prototype. Reach the first Bay Area teens.",
    },
    {
      year: "2024",
      amount: "$250,000 renewal",
      body: "Hire for Oakland. Rebuild curriculum with Oakland teens, alongside OUSD educators.",
    },
    {
      year: "2025",
      amount: "$200,000 renewal",
      body: "Prove the partnership model in Oakland's hardest soil.",
    },
  ];
  return (
    <Slide>
      <H2>Three years of investment.</H2>
      <Subhead>A bet that became a partnership.</Subhead>

      <div className="relative mt-16">
        {/* connecting line, desktop only */}
        <div
          className="hidden md:block absolute"
          style={{
            top: 18,
            left: "8%",
            right: "8%",
            height: 2,
            background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})`,
            opacity: 0.35,
          }}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
          {nodes.map((n) => (
            <div key={n.year} className="text-center px-2">
              <div
                className="mx-auto"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: ORANGE,
                  border: "4px solid #ffffff",
                  boxShadow: `0 0 0 2px ${ORANGE}`,
                  marginBottom: 28,
                }}
              />
              <div
                className="text-xs uppercase tracking-[0.16em] font-bold"
                style={{ color: ORANGE, marginBottom: 10 }}
              >
                {n.year}
              </div>
              <div
                className="font-extrabold"
                style={{
                  color: NAVY,
                  fontSize: "clamp(20px, 2.2vw, 26px)",
                  letterSpacing: "-0.015em",
                  lineHeight: 1.25,
                  marginBottom: 12,
                }}
              >
                {n.amount}
              </div>
              <p
                className="mx-auto"
                style={{
                  color: SOFT,
                  fontSize: 15,
                  lineHeight: 1.65,
                  maxWidth: 280,
                }}
              >
                {n.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

// 7. PRODUCT WORKS
function SlideProductWorks() {
  const stats = [
    { big: "3,500+", cap: "Teens reached across the Bay." },
    {
      big: "36",
      cap: "Active partners across schools and community organizations.",
    },
    {
      big: "19",
      cap: "Internship tracks across four career categories. Rebuilt with Oakland teens as our design partners.",
    },
  ];
  return (
    <Slide>
      <H2>Chapter one. The product works.</H2>
      <Subhead>The first half of the bet.</Subhead>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
        {stats.map((s) => (
          <div key={s.big} className="text-center px-2">
            <div
              className="font-display"
              style={{
                color: ORANGE,
                fontSize: "clamp(64px, 9vw, 120px)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                fontWeight: 800,
                marginBottom: 18,
              }}
            >
              {s.big}
            </div>
            <p
              className="mx-auto"
              style={{
                color: TEXT,
                fontSize: 15,
                lineHeight: 1.65,
                maxWidth: 280,
              }}
            >
              {s.cap}
            </p>
          </div>
        ))}
      </div>

      <ItalicLine>
        Curriculum proven. Reach demonstrated. Now we know what to scale.
      </ItalicLine>
    </Slide>
  );
}

// 8. CHANNEL QUALITY
function SlideChannelQuality() {
  const partners = [
    { name: "Hidden Genius Project", desc: "Black male tech leadership." },
    { name: "Aim High", desc: "Summer learning, middle to high school." },
    { name: "Hack The Hood", desc: "Youth tech and entrepreneurship." },
    { name: "Fresh Lifelines for Youth", desc: "Justice-involved youth." },
    { name: "CASA", desc: "Court-appointed advocates for foster youth." },
    { name: "OneGoal", desc: "First-gen college access." },
    {
      name: "EOYDC",
      desc: "East Oakland Youth Development Center.",
    },
  ];
  return (
    <Slide align="top">
      <H2>Channel quality is the real metric.</H2>
      <Subhead>
        We learned that aggregate retention numbers hide the truth. Where the
        kid comes from matters more.
      </Subhead>

      {/* two callouts */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10"
        style={{ maxWidth: 880, marginLeft: "auto", marginRight: "auto" }}
      >
        <div
          className="text-center rounded-2xl px-6 py-7"
          style={{
            background: "#F3F4F6",
            border: "1px solid #E5E7EB",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] font-bold mb-3"
            style={{ color: MUTED }}
          >
            School assemblies
          </div>
          <div
            className="font-extrabold"
            style={{
              color: MUTED,
              fontSize: "clamp(22px, 2.4vw, 28px)",
              letterSpacing: "-0.015em",
              lineHeight: 1.2,
            }}
          >
            Low single-digit conversion.
          </div>
        </div>
        <div
          className="text-center rounded-2xl px-6 py-7"
          style={{
            background: ORANGE_LIGHT,
            border: `1.5px solid ${ORANGE}`,
          }}
        >
          <div
            className="text-[11px] uppercase tracking-[0.16em] font-bold mb-3"
            style={{ color: ORANGE }}
          >
            Deep integration partnerships
          </div>
          <div
            className="font-extrabold"
            style={{
              color: NAVY,
              fontSize: "clamp(26px, 3vw, 36px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            75 to 86 percent engagement.
          </div>
        </div>
      </div>

      <p
        className="text-center mt-12 mb-6"
        style={{ color: TEXT, fontSize: 15, fontWeight: 600 }}
      >
        These are the seven deep integration partners in Oakland.
      </p>

      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mx-auto"
        style={{ maxWidth: 1000 }}
      >
        {partners.map((p) => (
          <div
            key={p.name}
            className="rounded-xl p-4"
            style={{
              background: "#ffffff",
              border: "1px solid #E5E7EB",
            }}
          >
            <div
              className="font-bold"
              style={{
                color: NAVY,
                fontSize: 14,
                letterSpacing: "-0.01em",
                lineHeight: 1.25,
                marginBottom: 4,
              }}
            >
              {p.name}
            </div>
            <div style={{ color: MUTED, fontSize: 12, lineHeight: 1.4 }}>
              {p.desc}
            </div>
          </div>
        ))}
        {/* 8th cell: waitlist tag */}
        <div
          className="rounded-xl p-4 flex items-center justify-center text-center"
          style={{
            background: CREAM,
            border: `1px dashed ${ORANGE}40`,
          }}
        >
          <span
            className="text-[11px] uppercase tracking-[0.14em] font-bold"
            style={{ color: ORANGE }}
          >
            + more on the waitlist
          </span>
        </div>
      </div>

      <ItalicLine>
        Schools are channel partners. These seven are the spine.
      </ItalicLine>
    </Slide>
  );
}

// 9. POWER USERS
function SlidePowerUsers() {
  const rows = [
    {
      rank: "#1",
      days: "338",
      profile: "Nigerian-American girl. 11 internships completed. Oakland.",
    },
    {
      rank: "#2",
      days: "274",
      profile: "[Profile placeholder. Remi will fill in.]",
    },
    {
      rank: "#3",
      days: "262",
      profile: "[Profile placeholder. Remi will fill in.]",
    },
    {
      rank: "#4",
      days: "252",
      profile: "[Profile placeholder. Remi will fill in.]",
    },
    {
      rank: "#5",
      days: "168",
      profile: "[Profile placeholder. Remi will fill in.]",
    },
    {
      rank: "#5",
      days: "168",
      profile: "[Profile placeholder. Remi will fill in.]",
    },
  ];
  return (
    <Slide align="top">
      <H2>The teens who told us this works.</H2>
      <Subhead>
        Our top 5 most engaged users. All Oakland or Oakland-adjacent.
      </Subhead>

      <div className="mt-12 mx-auto" style={{ maxWidth: 900 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid items-center gap-4 py-5"
            style={{
              gridTemplateColumns: "60px 140px 1fr",
              borderTop: i === 0 ? "none" : "1px solid #E5E7EB",
            }}
          >
            <div
              className="font-display"
              style={{
                color: MUTED,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {r.rank}
            </div>
            <div
              className="font-display"
              style={{
                color: ORANGE,
                fontSize: "clamp(34px, 4.5vw, 56px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {r.days}
              <span
                className="ml-2"
                style={{
                  fontSize: 12,
                  color: MUTED,
                  letterSpacing: "0.14em",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                days
              </span>
            </div>
            <div
              style={{
                color: TEXT,
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              {r.profile}
            </div>
          </div>
        ))}
      </div>

      <ItalicLine>
        The kids who fall in love with this are not random. They are from the
        neighborhoods you would expect, and they are doing the work harder
        than anyone.
      </ItalicLine>
    </Slide>
  );
}

// 10. AI MULTIPLIER
function SlideAIMultiplier() {
  return (
    <Slide>
      <H2>Chapter two. The adults are the multiplier.</H2>
      <Subhead>And AI is how we scale them.</Subhead>

      <div className="mx-auto mt-12" style={{ maxWidth: 720 }}>
        <p
          style={{
            color: TEXT,
            fontSize: "clamp(17px, 1.6vw, 20px)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          The Coach kid you watched was paired with a professional coach. That
          works. It does not scale.
        </p>
        <p
          style={{
            color: TEXT,
            fontSize: "clamp(17px, 1.6vw, 20px)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          Here is what we learned. Adult presence amplifies teen outcomes
          exponentially. Even a small amount of structured adult interaction
          goes deeper than hours of teen-only app time.
        </p>
        <p
          style={{
            color: TEXT,
            fontSize: "clamp(17px, 1.6vw, 20px)",
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          The unlock is AI. It generates a customized response for each teen,
          on each internship, at each moment. It turns any caring adult into
          that teen&apos;s first career advisor. A parent. A mentor. A coach.
          A counselor. The village.
        </p>
        <p
          style={{
            color: TEXT,
            fontSize: "clamp(17px, 1.6vw, 20px)",
            lineHeight: 1.7,
            marginBottom: 36,
          }}
        >
          That is what we are building next.
        </p>
        <div
          className="text-center text-[11px] uppercase tracking-[0.22em] font-bold"
          style={{ color: ORANGE }}
        >
          We turn every adult into a youth educator.
        </div>
      </div>
    </Slide>
  );
}

// 11. THE THREE NUMBERS
function SlideThreeNumbers() {
  const cards = [
    {
      big: "3,500+",
      caption:
        "Teens reached. 36 active partners. Positioned for continued growth on the existing base.",
      highlight: false,
    },
    {
      big: "75 to 86%",
      caption:
        "Engagement rate through deep integration partnerships. School assemblies convert at a fraction of that. We are reallocating toward channels that work.",
      highlight: true,
    },
    {
      big: "7",
      caption:
        "Deep integration partners in Oakland. The model is built. We are ready to scale it.",
      highlight: false,
    },
  ];
  return (
    <Slide>
      <H2>The three numbers you asked for in October.</H2>
      <Subhead>
        We learned that churn is not the right number. Channel quality is.
      </Subhead>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-14">
        {cards.map((c, i) => (
          <div
            key={i}
            className="rounded-2xl p-7"
            style={{
              background: c.highlight ? CREAM : "#ffffff",
              border: c.highlight
                ? `2px solid ${ORANGE}`
                : "1px solid #E5E7EB",
              minHeight: 280,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="font-display"
              style={{
                color: c.highlight ? ORANGE : NAVY,
                fontSize: "clamp(48px, 6vw, 76px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                marginBottom: 18,
              }}
            >
              {c.big}
            </div>
            <p
              style={{
                color: TEXT,
                fontSize: 14.5,
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {c.caption}
            </p>
          </div>
        ))}
      </div>

      <ItalicLine>
        These are the numbers we will report to you monthly from now on,
        whatever you decide today.
      </ItalicLine>
    </Slide>
  );
}

// 12. OAKLAND PROOF CITY
function SlideOakland() {
  const cols = [
    {
      label: "Adult-facing platform",
      body: "Finish the build. Every parent, mentor, coach, and counselor gets a personalized AI dashboard for the teen they love. Real-time visibility, AI-generated conversation guides, a playbook for showing up. Already in beta.",
    },
    {
      label: "Deep partnership deployment",
      body: "Strengthen the seven Oakland integration partners we have. Add five more focused on family-serving organizations. Active targets: Brotherhood of Elders Network, Oakland Kids First, Youth UpRising, Oakland Promise, Improve Your Tomorrow.",
    },
    {
      label: "Parent recruitment in Oakland",
      body: "A direct-to-parent acquisition motion. Distribution through PTA networks, faith communities, the Black Youth Development Book ecosystem, and partner referrals. Oakland parents become the first wave of village adults.",
    },
  ];
  return (
    <Slide>
      <H2>Oakland is where we prove the village model.</H2>
      <Subhead>
        AI-powered. Adult-amplified. Built for the city that already taught us
        the most.
      </Subhead>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-14">
        {cols.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl p-7"
            style={{
              background: NAVY,
              minHeight: 280,
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.16em] font-bold mb-4"
              style={{ color: ORANGE }}
            >
              {c.label}
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.82)",
                fontSize: 14.5,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {c.body}
            </p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

// 13. AI WORKFORCE
function SlideWorkforce() {
  const blocks = [
    {
      label: "The problem",
      body: "The careers that survive the next decade will be built on what makes us human. Curiosity. Critical thinking. Communication. Collaboration. Business sense. The kids we serve are at the bottom of the funnel for those roles. Not because they cannot do the work. Because no one has shown them the work exists.",
    },
    {
      label: "The curriculum we are building",
      body: "We are rebuilding the internship tracks around AI-era careers and the durable human skills that survive automation. Every internship becomes an entry point into a workforce that is being redrawn in real time. The first new tracks are already in development, designed with OUSD educators in the room.",
    },
    {
      label: "The bridge to companies",
      body: "We are building the bridge between Oakland teens and the companies that will hire them. Corporate partners shape internship content, contribute professionals to the Coach pilot, and get early visibility into the next generation of talent. Two years from now, the goal is for every OUSD teen on the app to be one introduction away from a real company.",
    },
  ];
  return (
    <Slide align="top">
      <H2>
        AI is reshaping the workforce. We are reshaping who gets to enter it.
      </H2>
      <Subhead>
        The next three years are not just about more kids. They are about
        which kids get a seat.
      </Subhead>

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12 mx-auto"
        style={{ maxWidth: 1080 }}
      >
        {blocks.map((b) => (
          <div
            key={b.label}
            className="rounded-2xl p-7"
            style={{
              background: "#ffffff",
              border: "1px solid #E5E7EB",
              minHeight: 320,
            }}
          >
            <div
              className="text-[11px] uppercase tracking-[0.16em] font-bold mb-4"
              style={{ color: ORANGE }}
            >
              {b.label}
            </div>
            <p
              style={{
                color: TEXT,
                fontSize: 14.5,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {b.body}
            </p>
          </div>
        ))}
      </div>

      <ItalicLine>
        This is what the second three years look like if we build it together.
      </ItalicLine>
    </Slide>
  );
}

// 14. ASK & CLOSE
function SlideAsk() {
  const tiers = [
    {
      label: "Tier 1",
      amount: "$100K / year for three years",
      header: "Partnership Development.",
      body: "Funds the partnership work I am leading personally in Oakland right now. Deepens the seven integration partners we have. Adds five more focused on family-serving organizations. This is the foundation everything else stands on.",
      anchor: false,
    },
    {
      label: "Tier 2",
      amount: "$200K / year for three years",
      header: "Partnership Development + AI Curriculum.",
      body: "Everything in Tier 1, plus the AI-era curriculum build. New internship tracks around AI careers and the durable human skills that survive automation. The Oakland teen who finishes this curriculum is ready for the workforce that is being built right now.",
      anchor: false,
    },
    {
      label: "Tier 3",
      amount: "$300K / year for three years",
      header:
        "Partnership Development + AI Curriculum + Corporate Partnership Build-Out.",
      body: "Everything in Tiers 1 and 2, plus the corporate partnership engine. We build the bridge between Oakland teens and the companies that will hire them. Lead Anchor Partner naming. Quarterly co-design sessions. First look at every metric. The chance to be the funder of record on the model that, if it works in Oakland, works anywhere.",
      anchor: true,
    },
  ];
  return (
    <Slide align="top">
      <H2>A renewed three-year commitment.</H2>
      <Subhead>
        Oakland as the pilot city for the AI-powered village model.
      </Subhead>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12">
        {tiers.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl p-6 relative"
            style={{
              background: t.anchor ? CREAM : "#ffffff",
              border: t.anchor ? `2px solid ${ORANGE}` : "1px solid #E5E7EB",
              minHeight: 320,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {t.anchor && (
              <span
                className="absolute text-[10px] uppercase tracking-[0.18em] font-bold rounded-full px-3 py-1"
                style={{
                  background: ORANGE,
                  color: "#ffffff",
                  top: -12,
                  left: 20,
                }}
              >
                Anchor
              </span>
            )}
            <div
              className="text-[11px] uppercase tracking-[0.18em] font-bold mb-3"
              style={{ color: ORANGE }}
            >
              {t.label}
            </div>
            <div
              className="font-extrabold mb-3"
              style={{
                color: NAVY,
                fontSize: t.anchor ? 19 : 18,
                letterSpacing: "-0.015em",
                lineHeight: 1.25,
              }}
            >
              {t.amount}
            </div>
            <div
              className="font-semibold mb-3"
              style={{
                color: NAVY,
                fontSize: 14,
                letterSpacing: "-0.005em",
                lineHeight: 1.4,
              }}
            >
              {t.header}
            </div>
            <p
              style={{
                color: SOFT,
                fontSize: 13.5,
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {t.body}
            </p>
          </div>
        ))}
      </div>

      <div
        className="mx-auto mt-12 mb-8"
        style={{ width: "55%", height: 1, background: "#E5E7EB" }}
      />

      <p
        className="italic text-center mx-auto"
        style={{
          color: TEXT,
          fontSize: "clamp(16px, 1.6vw, 19px)",
          lineHeight: 1.7,
          maxWidth: 720,
        }}
      >
        Jim, you do not need to decide today. You also do not need to decide
        alone. We would love a thinking partner for the next chapter, not
        just a funder. Whatever you choose, the work you funded is not going
        anywhere. It will get built because of you, with or without the next
        check. But we would rather build it with you.
      </p>
      <p
        className="italic text-center mt-6"
        style={{ color: NAVY, fontSize: 18, fontWeight: 500 }}
      >
        Remi.
      </p>
    </Slide>
  );
}

// ─────────────────────────────────────────────────────────
// Main deck
// ─────────────────────────────────────────────────────────
const SLIDES: Array<() => React.ReactElement> = [
  SlideCover,
  SlideNote,
  SlideVideo,
  SlideQuote,
  SlideHypothesis,
  SlideTimeline,
  SlideProductWorks,
  SlideChannelQuality,
  SlidePowerUsers,
  SlideAIMultiplier,
  SlideThreeNumbers,
  SlideOakland,
  SlideWorkforce,
  SlideAsk,
];

export default function Deck() {
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = i + dir;
        if (next < 0 || next >= TOTAL_SLIDES) return i;
        return next;
      });
    },
    [],
  );

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= TOTAL_SLIDES) return;
    setIndex(i);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input (defensive)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          go(-1);
          break;
        case "f":
        case "F":
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
          break;
        // ESC intentionally not bound. Avoid accidental exits.
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Click-to-advance. Disabled on the video slide so the iframe is
  // free to receive clicks for play/pause.
  const onRootClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (index === VIDEO_SLIDE_INDEX) return;
      const target = e.target as HTMLElement;
      // Don't hijack clicks on interactive elements.
      if (target.closest("a, button, iframe, input, textarea, select")) {
        return;
      }
      const x = e.clientX;
      const w = window.innerWidth;
      if (x > w / 2) go(1);
      else go(-1);
    },
    [go, index],
  );

  const CurrentSlide = SLIDES[index];

  return (
    <div
      ref={rootRef}
      className="font-heading fixed inset-0 overflow-hidden"
      style={{
        background: "#ffffff",
        color: INK,
        cursor: index === VIDEO_SLIDE_INDEX ? "default" : "pointer",
      }}
      onClick={onRootClick}
      onMouseMove={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="application"
      aria-label="Koshland Foundation conversation deck"
    >
      <div className="absolute inset-0 overflow-y-auto">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, ease: EASE }}
          className="min-h-screen w-full"
        >
          <CurrentSlide />
        </motion.div>
      </div>

      {/* Counter, bottom-right */}
      <div
        className="absolute bottom-5 right-6 select-none pointer-events-none"
        style={{
          color: MUTED,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {index + 1} / {TOTAL_SLIDES}
      </div>

      {/* Chevrons, bottom-center, fade in on hover */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 transition-opacity duration-300"
        style={{ opacity: hover ? 0.85 : 0 }}
      >
        <button
          type="button"
          aria-label="Previous slide"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className="rounded-full p-2 transition-colors"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #E5E7EB",
            color: NAVY,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="rounded-full p-2 transition-colors"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid #E5E7EB",
            color: NAVY,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6L15 12L9 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
