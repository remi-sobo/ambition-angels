import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getBoardContext } from "@/lib/board/auth";
import {
  getMeeting, getAgenda, getFollowUps, getResolutions, getAttendance,
  getMeetingDocuments, getMinutes, getMyNotes, getMyQuestions, getPrepItems,
  getAllMeetings, getMySharedNotes, getSharedNotes,
} from "@/lib/board/data";
import { longDate, timeRange, dateOnly, plainDate } from "@/lib/board/format";
import { Header, Footer } from "../../_components/Chrome";
import { MeetingTabs } from "../../_components/MeetingTabs";
import AgendaList from "../../_components/AgendaList";
import RsvpControl from "../../_components/RsvpControl";
import QuestionBox from "../../_components/QuestionBox";
import ChairBar from "../../_components/ChairBar";
import FileUpload from "../../_components/FileUpload";
import MinutesView from "../../_components/MinutesView";
import ShareNotes from "../../_components/ShareNotes";
import SharedNotesInbox from "../../_components/SharedNotesInbox";
import { MaterialsList, SinceWeLastMet, PrintHeader, PrintFooter } from "../../_components/MeetingParts";
import { C, F, card, eyebrow } from "../../_components/tokens";

export const dynamic = "force-dynamic";

/**
 * The browser title carries the meeting's own name, so a director with the
 * agenda, the pre-read and the portal open at once can tell the tabs apart.
 * The layout's static "Board portal · Ambition Angels" named every one of them
 * identically. Still noindex — inherited from the layout's robots directive.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const ctx = await getBoardContext();
  if (!ctx) return { title: "Board portal · Ambition Angels" };
  const meeting = await getMeeting(ctx.orgId, params.id);
  if (!meeting) return { title: "Board portal · Ambition Angels" };
  return { title: `${meeting.title} · Ambition Angels` };
}

/**
 * One meeting, three states, one URL (spec §10).
 *
 * Upcoming, live and closed all render here. A director learns one location
 * and it is always correct: it is where the agenda lives before, where she
 * follows along during, and where the minutes live after. Most board software
 * splits these into three places, which is why directors cannot find anything.
 */
export default async function MeetingPage({ params }: { params: { id: string } }) {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const meeting = await getMeeting(ctx.orgId, params.id);
  if (!meeting) notFound();

  const [agenda, docs, attendance, minutes, followUps, prep, allMeetings] = await Promise.all([
    getAgenda(meeting.id),
    getMeetingDocuments(meeting.id),
    getAttendance(meeting.id),
    getMinutes(meeting.id),
    getFollowUps(meeting.id),
    ctx.memberId ? getPrepItems(meeting.id, ctx.memberId) : Promise.resolve([]),
    getAllMeetings(ctx.orgId),
  ]);

  // Typed rather than inferred: the empty-object fallback for a signed-in
  // staffer who is not on the roster otherwise widens these to `{}`.
  const noNotes: Record<string, string> = {};
  const [notes, questions, sharedByMe] = ctx.memberId
    ? await Promise.all([
        getMyNotes(meeting.id, ctx.memberId),
        getMyQuestions(meeting.id, ctx.memberId),
        getMySharedNotes(meeting.id, ctx.memberId),
      ])
    : [noNotes, [] as Awaited<ReturnType<typeof getMyQuestions>>, noNotes];

  // RLS returns another director's sent note only to the designated
  // recipient, so this is empty for everyone else — board admins included.
  const sharedToMe = ctx.isNotesRecipient ? await getSharedNotes(meeting.id) : [];

  // Continuity comes from the meeting immediately before this one.
  const prior = allMeetings.find((m) => m.meeting_date < meeting.meeting_date) ?? null;
  const priorResolutions = prior ? await getResolutions(ctx.orgId, prior.id) : [];

  const isLive = meeting.status === "live";
  const isClosed = meeting.status === "closed";
  const yes = attendance.filter((a) => a.rsvp === "yes" && !a.is_staff).length;
  const myRsvp = attendance.find((a) => a.board_member_id === ctx.memberId)?.rsvp ?? null;
  const currentItem = agenda.find((a) => a.status === "current") ?? null;
  const doneCount = agenda.filter((a) => a.status === "done").length;

  return (
    <>
      <Header
        name={ctx.memberName ?? ctx.email}
        roleLine={ctx.isStaff ? "Staff" : "Director"}
        active="meetings"
        prepDone={prep.length ? prep.filter((p) => p.completed_at).length : undefined}
        prepTotal={prep.length || undefined}
      />
      <MeetingTabs active="upcoming" meetingId={meeting.id} />

      {isLive && (
        <div className="board-chrome" style={{ height: 3, background: C.rule }}>
          <div
            style={{
              width: `${agenda.length ? Math.round((doneCount / agenda.length) * 100) : 0}%`,
              height: "100%",
              background: C.orange,
              transition: "width .3s ease",
            }}
          />
        </div>
      )}

      <PrintHeader
        title={meeting.title}
        date={longDate(meeting.starts_at) || dateOnly(meeting.meeting_date, "long")}
        kind={isClosed ? "Minutes" : "Agenda"}
      />

      <main
        className="board-print-body"
        style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 120px" }}
      >
        {/* ── Meeting header block ───────────────────────────────────── */}
        <section className="board-print-flat" style={{ ...card, padding: "clamp(24px,3vw,40px)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 340px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {/* The label IS the meeting's name ("2026 Annual Meeting"),
                    so the old " · Annual meeting" suffix now repeats it. The
                    Bylaws designation is stated once, in the facts below. */}
                <span style={eyebrow}>{meeting.fiscal_label}</span>
                {isLive && (
                  <span style={{ ...eyebrow, color: C.orangeDark, display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="board-pulse" style={{ width: 9, height: 9, borderRadius: 999, background: C.orange, display: "block" }} />
                    Meeting in progress
                  </span>
                )}
                {isClosed && (
                  <span style={eyebrow}>
                    {minutes?.approved_at
                      ? `Approved ${plainDate(minutes.approved_at)}`
                      : "Awaiting approval at the next meeting"}
                  </span>
                )}
              </div>
              <h1
                style={{
                  margin: "14px 0 0",
                  fontFamily: F.heading,
                  fontSize: 32,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: C.ink,
                  maxWidth: "24ch",
                }}
              >
                {meeting.title}
              </h1>
              <div style={{ fontSize: 17, lineHeight: 1.5, color: C.charcoal, marginTop: 14 }}>
                {longDate(meeting.starts_at) || dateOnly(meeting.meeting_date, "long")}
                {meeting.starts_at ? ` · ${timeRange(meeting.starts_at, meeting.ends_at)}` : ""}
                {meeting.location ? ` · ${meeting.location}` : ""}
              </div>
            </div>

            <div className="board-noprint" style={{ flex: "none", display: "flex", flexDirection: "column", gap: 10, width: 264, maxWidth: "100%" }}>
              {isLive && meeting.zoom_url && (
                <a href={meeting.zoom_url} target="_blank" rel="noreferrer"
                   style={btn(C.orange, C.white, true)}>Join Zoom</a>
              )}
              {!isLive && !isClosed && (
                <a href={`/api/board/meetings/${meeting.id}/calendar`} style={btn(C.white, C.ink, false)}>
                  Add to calendar
                </a>
              )}
              {/* The minute book export. Not cuttable — it is the Corporate
                  Secretary's condition for retiring the Google Docs process. */}
              <Link href={`/board/meetings/${meeting.id}/print`} style={btn(C.white, C.ink, false)}>
                {isClosed ? "Print the minutes" : "Print the agenda"}
              </Link>
              {isClosed && minutes?.signed_pdf_path && (
                <a href={`/api/board/meetings/${meeting.id}/signed`} style={btn(C.white, C.ink, false)}>
                  Signed record
                </a>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 28,
              paddingTop: 20,
              borderTop: `1px solid ${C.rule}`,
              flexWrap: "wrap",
            }}
          >
            <Fact label="Quorum" value={`${meeting.quorum_required} of 5 directors`} strong />
            {meeting.meeting_type === "annual" && (
              <Fact label="Designated" value="Under Section 6 of the Bylaws" />
            )}
            <Fact label="Minutes" value="Shannon Fair" />
            {meeting.zoom_room && <Fact label="Zoom room" value={meeting.zoom_room} />}
          </div>
        </section>

        <div className="board-meeting-grid" style={{ marginTop: 40 }}>
          <div style={{ minWidth: 0 }}>
            {isClosed ? (
              <MinutesView minutes={minutes} followUps={followUps} meetingTitle={meeting.title} />
            ) : (
              <>
                {prior && (priorResolutions.length > 0 || followUps.length > 0) && (
                  <SinceWeLastMet
                    priorDate={dateOnly(prior.meeting_date, "plain")}
                    priorId={prior.id}
                    resolutions={priorResolutions}
                    followUps={followUps}
                  />
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 16,
                    margin: "40px 0 16px",
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>
                    Agenda
                  </h2>
                  <span style={{ fontSize: 15, color: C.muted }}>
                    {agenda.length} items · {agenda.reduce((a, i) => a + (i.duration_minutes ?? 0), 0)} minutes ·{" "}
                    {agenda.filter((a) => a.item_type === "decision" && a.brief?.motion).length} votes
                  </span>
                </div>

                <AgendaList
                  meetingId={meeting.id}
                  items={agenda}
                  docs={docs}
                  notes={notes}
                  canTakeNotes={!!ctx.memberId}
                  live={isLive}
                />
              </>
            )}

            {/* Sending is a separate act from writing. member_notes is
                untouched by it — see the route and the migration comment. */}
            {ctx.memberId && !ctx.isStaff && (
              <ShareNotes
                meetingId={meeting.id}
                recipient="Remi"
                notes={agenda
                  .filter((a) => (notes[a.id] ?? "").trim())
                  .map((a) => ({
                    agendaItemId: a.id,
                    itemTitle: a.title,
                    body: notes[a.id],
                    sentAt: sharedByMe[a.id] ?? null,
                  }))}
              />
            )}
          </div>

          <aside className="board-sticky board-noprint" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
            <MaterialsList docs={docs} />

            {/* Filing materials lives here because /admin/documents cannot
                attach a document to a meeting — see the route's comment. */}
            {ctx.isNotesRecipient && (
              <SharedNotesInbox
                notes={sharedToMe}
                titleOf={(id) => agenda.find((a) => a.id === id)?.title ?? "The meeting"}
              />
            )}

            {ctx.isAdmin && (
              <FileUpload
                endpoint={`/api/board/meetings/${meeting.id}/materials`}
                heading="File materials"
                blurb="Attaches to this meeting and appears under Materials for every director. Directors cannot see this panel."
                defaultType="board_packet"
              />
            )}

            {!isClosed && (
              <section style={{ ...card, padding: 28 }}>
                <h3 style={{ margin: 0, fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
                  Will you be there?
                </h3>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>
                  {yes} of 5 directors say yes. Quorum is {meeting.quorum_required}.
                </div>
                {ctx.memberId && !ctx.isStaff ? (
                  <RsvpControl meetingId={meeting.id} current={myRsvp} />
                ) : (
                  <p style={{ fontSize: 15, color: C.muted, marginTop: 14 }}>
                    You staff this meeting; RSVP is for directors.
                  </p>
                )}
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.rule}`, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {attendance
                    .filter((a) => !a.is_staff)
                    .map((a) => (
                      <span
                        key={a.board_member_id}
                        title={`${a.name} · ${a.rsvp ?? "no answer yet"}`}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          background: a.rsvp === "yes" ? C.ink : C.white,
                          color: a.rsvp === "yes" ? C.cream : C.muted,
                          border: a.rsvp === "yes" ? "none" : `1px solid ${C.rule}`,
                        }}
                      >
                        {a.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                    ))}
                </div>
              </section>
            )}

            {/* The question box opens when materials are posted and closes when
                the meeting starts. Asynchronous on purpose: a live question
                queue on a five-person Zoom call splits the CEO's attention and
                teaches the wrong habit. */}
            {!isLive && !isClosed && ctx.memberId && (
              <QuestionBox meetingId={meeting.id} existing={questions} />
            )}
          </aside>
        </div>
      </main>

      {ctx.isAdmin && !isClosed && (
        <ChairBar
          meetingId={meeting.id}
          status={meeting.status}
          items={agenda.map((a) => ({ id: a.id, title: a.title, duration_minutes: a.duration_minutes }))}
          currentId={currentItem?.id ?? null}
        />
      )}

      <PrintFooter />
      <Footer />
    </>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 15 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: strong ? C.ink : C.charcoal, fontWeight: strong ? 500 : 400 }}>{value}</span>
    </div>
  );
}

function btn(bg: string, fg: string, filled: boolean): React.CSSProperties {
  return {
    height: 52,
    borderRadius: 999,
    background: bg,
    color: fg,
    border: filled ? "none" : `1px solid ${C.rule}`,
    fontSize: 17,
    fontWeight: filled ? 600 : 500,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "0 22px",
  };
}
