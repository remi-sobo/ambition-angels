import { redirect } from "next/navigation";
import Link from "next/link";
import { getBoardContext } from "@/lib/board/auth";
import { getAllMeetings, getResolutions } from "@/lib/board/data";
import { dateOnly, tallyLabel } from "@/lib/board/format";
import { Header, Footer } from "../_components/Chrome";
import { MeetingTabs } from "../_components/MeetingTabs";
import DecisionsRegister from "../_components/DecisionsRegister";
import { C, F, card } from "../_components/tokens";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  regular: "Regular",
  special: "Special",
  annual: "Annual",
  budget: "Budget",
  consent: "Written consent",
};

/**
 * Archive (spec §5.6). Two tabs on one screen, not two routes.
 *
 * Historical folders were named inconsistently ("Q2 2024 August 31 2023"), so
 * display normalizes on the fiscal label with the calendar date beneath.
 */
export default async function ArchivePage({ searchParams }: { searchParams: { tab?: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const tab = searchParams.tab === "decisions" ? "decisions" : "past";
  const meetings = await getAllMeetings(ctx.orgId);
  const resolutions = tab === "decisions" ? await getResolutions(ctx.orgId) : [];

  const byMeeting = new Map(meetings.map((m) => [m.id, m]));

  // Group by calendar year, newest first. meetings already arrives sorted
  // by date descending, so insertion order gives the right year order too.
  const years: { year: string; rows: typeof meetings }[] = [];
  for (const m of meetings) {
    const y = m.meeting_date.slice(0, 4);
    const bucket = years.find((b) => b.year === y);
    if (bucket) bucket.rows.push(m);
    else years.push({ year: y, rows: [m] });
  }

  return (
    <>
      <Header name={ctx.memberName ?? ctx.email} roleLine={ctx.isStaff ? "Staff" : "Director"} active="meetings" />
      <MeetingTabs active={tab === "decisions" ? "decisions" : "past"} meetingId={meetings[0]?.id} />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 24px 80px" }}>
        {tab === "past" ? (
          <>
            <p style={{ margin: "32px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>
              Every meeting on record. Historical folders were named inconsistently, so records are
              normalised to the fiscal label with the calendar date beneath.
            </p>
            {years.map(({ year, rows }) => (
              <section key={year} style={{ marginTop: 48 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif",
                    fontWeight: 800,
                    fontSize: 32,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    color: C.ink,
                  }}
                >
                  {year}
                </div>
                <div style={{ ...card, marginTop: 16 }}>
                  {rows.map((m, i) => (
                    <Link
                      key={m.id}
                      href={`/board/meetings/${m.id}`}
                      className="board-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 20,
                        padding: "20px 28px",
                        borderTop: i === 0 ? "none" : `1px solid ${C.rule}`,
                        textDecoration: "none",
                        color: C.ink,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Wide enough for a named meeting ("2026 Annual
                          Meeting"), not just a "FY26 Q1" quarter tag. */}
                      <span style={{ flex: "none", width: 150, fontFamily: F.heading, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>
                        {m.fiscal_label ?? "—"}
                      </span>
                      <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.4 }}>
                          {m.title}
                        </span>
                        <span style={{ display: "block", fontSize: 15, color: C.muted, marginTop: 3 }}>
                          {dateOnly(m.meeting_date, "plain")} · {KIND[m.meeting_type] ?? "Regular"}
                        </span>
                      </span>
                      <span style={{ flex: "none", fontSize: 15, color: C.muted, width: 150, textAlign: "right" }}>
                        {statusLabel(m.status, m.minutes_status)}
                      </span>
                      <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M1.5 1L6.5 7L1.5 13" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <DecisionsRegister
            rows={resolutions.map((r) => ({
              id: r.id,
              motion: r.motion_text,
              fiscal: byMeeting.get(r.meeting_id)?.fiscal_label ?? "",
              date: dateOnly(byMeeting.get(r.meeting_id)?.meeting_date ?? null, "plain"),
              year: (byMeeting.get(r.meeting_id)?.meeting_date ?? "").slice(0, 4),
              tally: tallyLabel(r),
              abstain: r.abstentions?.length ? `${r.abstentions.join(", ")} abstained` : "",
              meetingId: r.meeting_id,
            }))}
          />
        )}
      </main>

      <Footer />
    </>
  );
}

function statusLabel(status: string, minutesStatus: string): string {
  if (status === "live") return "In progress";
  if (status === "upcoming") return "Upcoming";
  return minutesStatus === "approved" ? "Minutes approved" : "Awaiting approval";
}
