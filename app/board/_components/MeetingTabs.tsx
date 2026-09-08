import Link from "next/link";
import { C, F } from "./tokens";

/**
 * The three views of the meetings surface: this meeting, past meetings, and
 * the decisions register. One screen with tabs rather than three routes, so a
 * director learns one place.
 */
export function MeetingTabs({
  active,
  meetingId,
}: {
  active: "upcoming" | "past" | "decisions";
  meetingId?: string;
}) {
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: "upcoming", label: "This meeting", href: meetingId ? `/board/meetings/${meetingId}` : "/board" },
    { key: "past", label: "Past meetings", href: "/board/archive" },
    { key: "decisions", label: "Decisions", href: "/board/archive?tab=decisions" },
  ];
  return (
    <div className="board-chrome" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
      <div style={{ display: "flex", gap: 32, borderBottom: `1px solid ${C.rule}`, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            style={{
              position: "relative",
              fontFamily: F.heading,
              fontSize: 17,
              fontWeight: 500,
              color: active === t.key ? C.ink : C.charcoal,
              textDecoration: "none",
              padding: "22px 0 14px",
            }}
          >
            {t.label}
            {active === t.key && (
              <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: C.ink }} />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
