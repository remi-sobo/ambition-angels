"use client";

import { useReedLauncher } from "@/app/admin/_components/reed/ReedLauncherProvider";

/**
 * "Prep with Reed" — opens Reed pre-aimed at building an agenda for an upcoming
 * meeting via the shared launcher. Reed reads the meeting brief (who it's with,
 * first meeting vs. follow-up), pulls each matched donor/partner's dossier
 * (giving, history, open asks), then drafts a tailored agenda. Read-only — it
 * researches and proposes talking points, it never sends or changes anything.
 * Self-gates on the launcher's entitlement, so it renders nothing when ai.reed
 * is off.
 */
const PREP_PROMPT =
  "Prep me for this upcoming meeting. Research who I'm meeting with, review our history, " +
  "and build a thoughtful agenda for the next touchpoint — whether it's a first meeting or a follow-up.";

export default function MeetingAgendaButton({
  eventId,
  title,
  start,
  label = "Prep with Reed",
  size = "sm",
}: {
  eventId: string;
  title: string | null;
  start: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const reed = useReedLauncher();
  if (!reed.enabled) return null;
  const dims = size === "md" ? "text-[13px] gap-1.5 px-4 py-2" : "text-[11px] gap-1.5 px-3 py-1.5";
  const mark = size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  return (
    <button
      onClick={() =>
        reed.open({
          surface: "meeting_agenda",
          draft: PREP_PROMPT,
          contextRef: { type: "meeting_agenda", event_id: eventId, title, start },
        })
      }
      className={`shrink-0 inline-flex items-center font-semibold text-white bg-navy hover:bg-[#19305f] rounded-full transition-colors ${dims}`}
    >
      <ReedMark className={`${mark} text-orange-mid`} />
      {label}
    </button>
  );
}

function ReedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z" />
    </svg>
  );
}
