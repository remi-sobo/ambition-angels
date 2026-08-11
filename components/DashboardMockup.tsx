"use client";

/**
 * The Guide/Teacher dashboard mockup. Renders the real screenshot asset
 * (public/images/teacher-dashboard-mockup.png — the laptop-framed Teacher
 * Dashboard image) and always carries a "sample data" caption under it, per
 * the build plan. If the asset is missing (e.g. the PNG hasn't been dropped
 * into public/images yet), it falls back to a CSS-built mock so the page
 * never shows a broken image. The fallback keeps two language frames:
 * "school" (Advisory Roster) and "group" (Group Roster) — and its sidebar
 * deliberately says Recognition, never Rewards.
 */

import { useState } from "react";
import Image from "next/image";

type Frame = "school" | "group";

type RosterRow = {
  initials: string;
  name: string;
  detail: string;
  internship: string;
  day: number;
  status: "on-track" | "progress" | "check-in";
};

const STATUS_STYLE: Record<RosterRow["status"], { dot: string; label: string; chip: string }> = {
  "on-track": { dot: "bg-emerald-500", label: "On track", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  progress: { dot: "bg-amber-500", label: "Making progress", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  "check-in": { dot: "bg-orange", label: "Needs a check-in", chip: "bg-orange-light text-orange-dark border-orange/30" },
};

const ROWS: RosterRow[] = [
  { initials: "JC", name: "Jayla C.", detail: "Grade 10", internship: "Nursing", day: 22, status: "on-track" },
  { initials: "MR", name: "Mateo R.", detail: "Grade 9", internship: "Entrepreneurship", day: 17, status: "on-track" },
  { initials: "TW", name: "Tiana W.", detail: "Grade 11", internship: "Game Design", day: 9, status: "progress" },
  { initials: "DK", name: "Darius K.", detail: "Grade 9", internship: "Wealth Management", day: 5, status: "check-in" },
  { initials: "AS", name: "Amara S.", detail: "Grade 12", internship: "Marketing", day: 27, status: "on-track" },
];

function FallbackMock({ frame }: { frame: Frame }) {
  const isSchool = frame === "school";
  const rosterTitle = isSchool ? "Advisory Roster" : "Group Roster";
  const contextLabel = isSchool ? "Period 4 Advisory · 24 students" : "Tuesday cohort · 18 teens";
  const rows = isSchool ? ROWS : ROWS.map((r) => ({ ...r, detail: "" }));

  return (
    <div>
      {/* Laptop frame */}
      <div className="rounded-t-2xl border border-gray-mid/50 border-b-0 bg-[#FDFDFB] shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-light border-b border-gray-mid/40">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
          <div className="ml-3 flex-1 max-w-xs bg-white border border-gray-mid/40 rounded-md px-3 py-1 text-[10px] text-gray-warm truncate">
            app.ambitionangels.org/guide
          </div>
        </div>

        <div className="flex text-left">
          {/* Sidebar */}
          <div className="hidden sm:flex w-36 lg:w-44 flex-shrink-0 flex-col bg-ink text-cream/70 py-4 px-3 gap-0.5 text-[11px]">
            <div className="font-heading font-bold text-cream text-xs px-2 mb-3 tracking-tight">
              Ambition <span className="text-orange">Guide</span>
            </div>
            {["Dashboard", "Roster", "Prompts", "Follow-ups", "Recognition"].map((item, i) => (
              <div
                key={item}
                className={`px-2 py-1.5 rounded-md ${i === 0 ? "bg-orange/20 text-orange font-semibold" : ""}`}
              >
                {item}
              </div>
            ))}
          </div>

          {/* Main panel */}
          <div className="flex-1 p-4 lg:p-5 min-w-0">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div>
                <div className="font-heading font-bold text-ink text-sm lg:text-base leading-tight">{rosterTitle}</div>
                <div className="text-gray-warm text-[10px] lg:text-[11px]">{contextLabel}</div>
              </div>
              <div className="hidden lg:flex gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">18 on track</span>
                <span className="px-2 py-0.5 rounded-full border bg-orange-light text-orange-dark border-orange/30">3 need a check-in</span>
              </div>
            </div>

            {/* Roster table */}
            <div className="border border-gray-light rounded-xl overflow-hidden bg-white">
              {rows.map((row, i) => {
                const s = STATUS_STYLE[row.status];
                return (
                  <div
                    key={row.name}
                    className={`flex items-center gap-2.5 px-3 py-2 ${i > 0 ? "border-t border-gray-light" : ""}`}
                  >
                    <span className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-orange-light border border-orange/25 flex items-center justify-center flex-shrink-0">
                      <span className="text-[8px] lg:text-[9px] font-bold text-orange">{row.initials}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] lg:text-xs font-semibold text-ink truncate">
                        {row.name}
                        {row.detail && <span className="font-normal text-gray-warm"> · {row.detail}</span>}
                      </div>
                      <div className="text-[9px] lg:text-[10px] text-gray-warm truncate">
                        {row.internship} · Day {row.day} of 30
                      </div>
                    </div>
                    <div className="hidden md:block w-20 lg:w-24 flex-shrink-0">
                      <div className="h-1.5 rounded-full bg-gray-light overflow-hidden">
                        <div className="h-full rounded-full bg-orange" style={{ width: `${Math.round((row.day / 30) * 100)}%` }} />
                      </div>
                    </div>
                    <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] lg:text-[10px] font-medium flex-shrink-0 ${s.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Prompt + follow-up cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5">
              <div className="bg-white border border-gray-light rounded-xl p-3" style={{ borderLeft: "3px solid #E8500A" }}>
                <div className="text-[9px] font-bold text-orange uppercase tracking-widest mb-1">
                  This week&apos;s prompt · Jayla C.
                </div>
                <p className="text-[10px] lg:text-[11px] text-ink leading-snug">
                  &ldquo;You&apos;re three weeks into the nursing internship — what surprised you most about a nurse&apos;s day?&rdquo;
                </p>
              </div>
              <div className="bg-white border border-gray-light rounded-xl p-3">
                <div className="text-[9px] font-bold text-gray-warm uppercase tracking-widest mb-1">
                  Follow-up · Darius K.
                </div>
                <p className="text-[10px] lg:text-[11px] text-charcoal leading-snug mb-1.5">
                  Quiet for 6 days, stalled on Day 5. Suggested note ready.
                </p>
                <span className="inline-block bg-orange text-white text-[9px] font-semibold px-2.5 py-1 rounded-full">
                  Send check-in
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Laptop base */}
      <div className="h-2.5 rounded-b-2xl bg-gradient-to-b from-gray-mid/70 to-gray-mid/40 mx-[-2%]" />
    </div>
  );
}

export default function DashboardMockup({
  frame = "school",
  className = "",
}: {
  frame?: Frame;
  className?: string;
}) {
  const [imageMissing, setImageMissing] = useState(false);

  return (
    <figure className={className}>
      {imageMissing ? (
        <FallbackMock frame={frame} />
      ) : (
        <Image
          src="/images/teacher-dashboard-mockup.png"
          alt="Teacher dashboard on a laptop: an advisory roster showing each student's current internship, progress, and status, with a student spotlight, conversation prompts, and this week's follow-ups"
          width={1536}
          height={1024}
          className="w-full h-auto"
          onError={() => setImageMissing(true)}
        />
      )}
      <figcaption className="mt-3 text-center text-xs text-gray-warm">
        Teacher dashboard — sample data shown for illustration.
      </figcaption>
    </figure>
  );
}
