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
// Deck chrome: Oakland map watermark + Ambition Angels logo
// Both are constant across all 14 slides.
// ─────────────────────────────────────────────────────────
function OaklandMap({ style }: { style?: React.CSSProperties }) {
  // Stylized Oakland city boundary. Not cartographically exact, but
  // shaped to read as Oakland: long axis NE to SW, west coast jagged
  // (Bay), east edge bulging into the Oakland Hills, Lake Merritt
  // marked in the center-west.
  return (
    <svg
      viewBox="0 0 200 240"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      style={style}
    >
      <path
        d="M 55 35
           L 90 28
           L 130 32
           L 160 50
           L 170 75
           L 185 110
           L 190 145
           L 178 175
           L 158 200
           L 125 215
           L 90 220
           L 55 215
           L 35 195
           L 20 160
           L 18 120
           L 28 80
           L 38 55
           Z"
      />
      {/* Lake Merritt */}
      <ellipse
        cx="95"
        cy="110"
        rx="11"
        ry="6.5"
        transform="rotate(-20 95 110)"
        strokeWidth="1.2"
      />
      <text
        x="100"
        y="160"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="9"
        fontWeight="700"
        letterSpacing="3"
      >
        OAKLAND
      </text>
    </svg>
  );
}

function AmbitionLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="rounded-[8px] flex items-center justify-center"
        style={{ background: ORANGE, width: 26, height: 26 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
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
          color: NAVY,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "-0.02em",
        }}
      >
        Ambition Angels
      </span>
    </div>
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
          A conversation. May 18, 2026.
        </div>
        <div
          className="mt-3 text-[11px] uppercase tracking-[0.22em]"
          style={{ color: ORANGE, fontWeight: 700 }}
        >
          East Palo Alto to Oakland.
        </div>
      </div>
    </Slide>
  );
}

// 2. SETUP. A runway into the video.
function SlideNote() {
  return (
    <Slide>
      <div className="text-center mx-auto" style={{ maxWidth: 800 }}>
        <div
          className="text-[11px] md:text-xs uppercase tracking-[0.28em] mb-10"
          style={{ color: ORANGE, fontWeight: 700 }}
        >
          Before any of the numbers
        </div>
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: NAVY,
            fontSize: "clamp(26px, 3.6vw, 44px)",
            lineHeight: 1.25,
            letterSpacing: "-0.015em",
            fontWeight: 400,
            marginBottom: 36,
          }}
        >
          Three years in. The hypothesis we tested. What we learned. What we
          want to build with you next.
        </p>
        <p
          className="italic"
          style={{
            color: MUTED,
            fontSize: "clamp(15px, 1.5vw, 18px)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Meet one of our first Coach pilot kids.
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
            Teens engage best when there is an adult in the loop. Adult
            presence is what amplifies impact and extends how long a teen
            stays with the work. We are building the tool that turns existing
            adults in a teen&apos;s life into that engine, with AI generating
            personalized ways to support each kid.
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
          className="rounded-2xl px-6 py-6"
          style={{
            background: ORANGE_LIGHT,
            border: `1.5px solid ${ORANGE}`,
          }}
        >
          <div
            className="text-center text-[11px] uppercase tracking-[0.16em] font-bold mb-4"
            style={{ color: ORANGE }}
          >
            Deep integration partnerships
          </div>
          <div className="text-center mb-3">
            <div
              className="font-display font-extrabold"
              style={{
                color: NAVY,
                fontSize: "clamp(40px, 5vw, 60px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              75%
            </div>
            <div
              className="mx-auto mt-1"
              style={{
                color: SOFT,
                fontSize: 12.5,
                lineHeight: 1.4,
                maxWidth: 260,
              }}
            >
              Internship completion rate in deep integration partnerships.
            </div>
          </div>
          <div
            className="mx-auto my-2"
            style={{ height: 1, width: "40%", background: `${ORANGE}30` }}
          />
          <div className="text-center mt-3">
            <div
              className="font-display font-extrabold"
              style={{
                color: NAVY,
                fontSize: "clamp(40px, 5vw, 60px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              86%
            </div>
            <div
              className="mx-auto mt-1"
              style={{
                color: SOFT,
                fontSize: 12.5,
                lineHeight: 1.4,
                maxWidth: 280,
              }}
            >
              Course-to-course retention rate. Teens who finish one
              internship and start another.
            </div>
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
    { rank: "#1", days: "338", profile: "11 internships completed. Girl. Oakland." },
    { rank: "#2", days: "274", profile: "Boy. Hayward." },
    { rank: "#3", days: "262", profile: "Girl. Alameda." },
    { rank: "#4", days: "252", profile: "Boy. Oakland." },
    { rank: "#5", days: "168", profile: "Girl. San Leandro." },
    { rank: "#5", days: "168", profile: "Boy. Oakland." },
  ];
  return (
    <Slide align="top">
      <H2>The teens who told us this works.</H2>
      <Subhead>
        Our top 6 most engaged users. All Oakland or Oakland-adjacent.
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
        Every one of these teens came through an organization that made the
        app part of its program. That is the model.
      </ItalicLine>
    </Slide>
  );
}

// 10. AI MULTIPLIER
function SlideAIMultiplier() {
  const para: React.CSSProperties = {
    color: TEXT,
    fontSize: "clamp(17px, 1.6vw, 20px)",
    lineHeight: 1.7,
    marginBottom: 22,
  };
  return (
    <Slide>
      <H2>Chapter two. The adults are the multiplier.</H2>
      <Subhead>
        The adults are already in their lives. We are giving them the tool.
      </Subhead>

      <div className="mx-auto mt-12" style={{ maxWidth: 720 }}>
        <p style={para}>
          Every teen we serve has adults who already care about them. A
          parent. A mentor. A coach. A youth educator. A counselor. They are
          already there.
        </p>
        <p style={para}>
          We are building the tool that lets them drive it. They hold the
          teen accountable. They have the conversation. They follow up. AI
          supports them with customized prompts, tied to whatever internship
          the teen is doing in the moment.
        </p>
        <p style={{ ...para, marginBottom: 36 }}>
          Some teens will run on their own. At scale, the adults are the
          engine.
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
  const sideCard: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #E5E7EB",
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
  };
  return (
    <Slide>
      <H2>The three numbers you asked for in October.</H2>
      <Subhead>
        We learned that aggregate churn is not the right number. Channel
        quality is.
      </Subhead>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-14">
        {/* Card 1 */}
        <div className="rounded-2xl p-7" style={sideCard}>
          <div
            className="font-display"
            style={{
              color: NAVY,
              fontSize: "clamp(48px, 6vw, 76px)",
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              marginBottom: 18,
            }}
          >
            3,500+
          </div>
          <p
            style={{ color: TEXT, fontSize: 14.5, lineHeight: 1.65, margin: 0 }}
          >
            Teens reached. 36 active partners. Positioned for continued
            growth on the existing base.
          </p>
        </div>

        {/* Card 2, stacked stats, highlighted */}
        <div
          className="rounded-2xl p-7"
          style={{
            background: CREAM,
            border: `2px solid ${ORANGE}`,
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div>
            <div
              className="font-display"
              style={{
                color: ORANGE,
                fontSize: "clamp(42px, 5vw, 64px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                fontWeight: 800,
              }}
            >
              75%
            </div>
            <p
              className="mt-2"
              style={{ color: TEXT, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}
            >
              Internship completion rate in deep integration partnerships.
            </p>
          </div>
          <div
            className="my-5"
            style={{ height: 1, width: "40%", background: `${ORANGE}30` }}
          />
          <div>
            <div
              className="font-display"
              style={{
                color: ORANGE,
                fontSize: "clamp(42px, 5vw, 64px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                fontWeight: 800,
              }}
            >
              86%
            </div>
            <p
              className="mt-2"
              style={{ color: TEXT, fontSize: 13.5, lineHeight: 1.55, margin: 0 }}
            >
              Course-to-course retention. Teens who finish one internship
              and start another.
            </p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="rounded-2xl p-7" style={sideCard}>
          <div
            className="font-display"
            style={{
              color: NAVY,
              fontSize: "clamp(48px, 6vw, 76px)",
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              fontWeight: 800,
              marginBottom: 18,
            }}
          >
            7
          </div>
          <p
            style={{ color: TEXT, fontSize: 14.5, lineHeight: 1.65, margin: 0 }}
          >
            Deep integration partners in Oakland. The model is built. We are
            ready to scale it.
          </p>
        </div>
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
      <H2>Oakland is where we prove the adult-led model.</H2>
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
      body: "The careers that survive the next decade are built on what makes us human. Curiosity. Critical thinking. Communication. Collaboration. The kids we serve are at the bottom of that funnel.",
    },
    {
      label: "The curriculum we are building",
      body: "New internship tracks around AI-era careers and the durable skills that survive automation. In development now.",
    },
    {
      label: "The bridge to companies",
      body: "Corporate partners shape internship content, contribute professionals, and get early access to the next generation of talent. Oakland teens, one introduction away from a real company.",
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
        This is what the second three years look like, built together.
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
      body: "Funds the partnership work I am leading personally in Oakland right now. Deepens the seven integration partners we have. Adds five more focused on family-serving organizations. The foundation everything else stands on.",
      anchor: false,
    },
    {
      label: "Tier 2",
      amount: "$150K / year for three years",
      header: "Partnership Development + AI Curriculum.",
      body: "Everything in Tier 1, plus the AI-era curriculum build. New internship tracks around AI careers and the durable human skills that survive automation. The Oakland teen who finishes this curriculum is ready for the workforce being built right now.",
      anchor: false,
    },
    {
      label: "Tier 3",
      amount: "$200K / year for three years",
      header:
        "Partnership Development + AI Curriculum + Corporate Partnership Build-Out.",
      body: "Everything in Tiers 1 and 2, plus the corporate partnership engine. We build the bridge between Oakland teens and the companies that will hire them. Lead Anchor Partner naming. Quarterly co-design sessions. First look at every metric.",
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

      <p
        className="text-center mx-auto mt-16"
        style={{
          color: NAVY,
          fontSize: "clamp(18px, 2vw, 24px)",
          lineHeight: 1.5,
          letterSpacing: "-0.01em",
          fontWeight: 500,
          maxWidth: 820,
        }}
      >
        Oakland teens. The adults around them. The companies that will hire
        them. This is the build.
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
      {/* Oakland map watermark, behind everything */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          bottom: -70,
          right: -60,
          width: 420,
          height: 504,
          opacity: 0.055,
          color: ORANGE,
          zIndex: 0,
        }}
        aria-hidden
      >
        <OaklandMap style={{ width: "100%", height: "100%" }} />
      </div>

      <div className="absolute inset-0 overflow-y-auto" style={{ zIndex: 1 }}>
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

      {/* Logo, bottom-left, constant across slides */}
      <div
        className="absolute bottom-5 left-6 select-none pointer-events-none"
        style={{ zIndex: 2 }}
      >
        <AmbitionLogo />
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
          zIndex: 2,
        }}
      >
        {index + 1} / {TOTAL_SLIDES}
      </div>

      {/* Chevrons, bottom-center, fade in on hover */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 transition-opacity duration-300"
        style={{ opacity: hover ? 0.85 : 0, zIndex: 2 }}
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
