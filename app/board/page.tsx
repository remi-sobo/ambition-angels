import { redirect } from "next/navigation";
import Link from "next/link";
import { getBoardContext } from "@/lib/board/auth";
import {
  getCurrentMeeting,
  getAgenda,
  getPrepItems,
  type AgendaItem,
} from "@/lib/board/data";
import { createServerSupabase } from "@/lib/supabase/server";
import { heroDate, timeRange, dateOnly, prepHeading } from "@/lib/board/format";
import { Header, Footer } from "./_components/Chrome";
import PrepList from "./_components/PrepList";
import { C, F, card, eyebrow } from "./_components/tokens";

export const dynamic = "force-dynamic";

type Stat = { value: string; label: string; note: string };

/**
 * Home (spec §5.2) — the most important screen. A director should be able to
 * do everything she needs from here without navigating.
 *
 * The prototype also carried a "since you were last here" change feed. It is
 * deliberately not built: the V2 audit filed it under "Fix in V2 — needs a
 * spec", it needs per-director last-seen tracking that nothing else uses, and
 * it is not in the spec's §5.2. Everything it announced is on this page anyway.
 */
export default async function BoardHome() {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const meeting = await getCurrentMeeting(ctx.orgId);
  if (!meeting) {
    return (
      <>
        <Header name={ctx.memberName ?? ctx.email} roleLine="Director" active="home" />
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px" }}>
          <h1 style={{ fontFamily: F.heading, fontSize: 32, fontWeight: 600, margin: 0 }}>
            No meeting is scheduled
          </h1>
          <p style={{ fontSize: 17, color: C.muted, marginTop: 12 }}>
            When Shannon publishes the next agenda it will appear here. The{" "}
            <Link href="/board/library" style={{ color: C.ink }}>library</Link> and the{" "}
            <Link href="/board/archive" style={{ color: C.ink }}>archive</Link> are always available.
          </p>
        </main>
        <Footer />
      </>
    );
  }

  const [agenda, prep, stats] = await Promise.all([
    getAgenda(meeting.id),
    ctx.memberId ? getPrepItems(meeting.id, ctx.memberId) : Promise.resolve([]),
    getHeadlineStats(meeting.id),
  ]);

  const prepDone = prep.filter((p) => p.completed_at).length;
  const isLive = meeting.status === "live";
  const decisions = agenda.filter((a) => a.item_type === "decision");
  const main = mainQuestion(agenda);

  return (
    <>
      <Header
        name={ctx.memberName ?? ctx.email}
        roleLine={ctx.isStaff ? "Staff" : "Director"}
        active="home"
        prepDone={prep.length ? prepDone : undefined}
        prepTotal={prep.length || undefined}
      />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 0" }}>
        {/* ── Hero: the next meeting ─────────────────────────────────── */}
        <section
          style={{
            ...card,
            padding: "clamp(28px, 4vw, 48px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 40,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 380px" }}>
            <div style={{ ...eyebrow, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span>{meeting.title}</span>
              {isLive && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    color: C.orangeDark,
                    letterSpacing: "0.16em",
                  }}
                >
                  <span
                    className="board-pulse"
                    style={{ width: 9, height: 9, borderRadius: 999, background: C.orange, display: "block" }}
                  />
                  Meeting in progress
                </span>
              )}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(44px, 6vw, 66px)",
                lineHeight: 0.92,
                textTransform: "uppercase",
                color: C.ink,
              }}
            >
              {heroDate(meeting.starts_at) || dateOnly(meeting.meeting_date, "long")}
            </h1>
            <div style={{ fontSize: 17, lineHeight: 1.5, color: C.muted, marginTop: 18 }}>
              {timeRange(meeting.starts_at, meeting.ends_at)}
              {meeting.location ? ` · ${meeting.location}` : ""} · Quorum is {meeting.quorum_required} of 5
            </div>
            {meeting.meeting_type === "annual" && (
              <div style={{ fontSize: 15, lineHeight: 1.5, color: C.muted, marginTop: 6 }}>
                Designated the annual meeting under Section 6 of the Bylaws
              </div>
            )}
            {meeting.zoom_room && (
              <div style={{ fontSize: 15, lineHeight: 1.5, color: C.muted, marginTop: 6 }}>
                Zoom room {meeting.zoom_room}
              </div>
            )}
          </div>

          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <a
              href={`/api/board/meetings/${meeting.id}/calendar`}
              style={{
                height: 52,
                padding: "0 22px",
                border: `1px solid ${C.rule}`,
                borderRadius: 999,
                background: C.white,
                color: C.ink,
                fontSize: 17,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Add to calendar
            </a>
            {meeting.zoom_url && (
              <a
                href={meeting.zoom_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  height: 52,
                  padding: "0 30px",
                  borderRadius: 999,
                  background: C.orange,
                  color: C.white,
                  fontSize: 17,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {isLive ? "Follow along" : "Join Zoom"}
              </a>
            )}
          </div>
        </section>

        {/* ── Prep, and the main question ────────────────────────────── */}
        <div className="board-two-col" style={{ marginTop: 24 }}>
          {ctx.memberId && prep.length > 0 ? (
            <PrepList meetingId={meeting.id} items={prep} heading={prepHeading(meeting.starts_at)} />
          ) : (
            <section style={{ ...card, padding: 32 }}>
              <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>
                {prepHeading(meeting.starts_at)}
              </h2>
              <p style={{ margin: "12px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted }}>
                {ctx.isStaff
                  ? "Prep items are assigned to directors. You staff the meeting."
                  : "No prep items are assigned to you for this meeting."}
              </p>
            </section>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 24, alignSelf: "start" }}>
            <section style={{ ...card, padding: 32 }}>
              <div style={eyebrow}>The board&rsquo;s main question</div>
              <h2
                style={{
                  margin: "14px 0 0",
                  fontFamily: F.heading,
                  fontSize: 24,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                  color: C.ink,
                }}
              >
                {main
                  ? (main.brief?.question ?? questionFrom(main))
                  : "The agenda is being finalised."}
              </h2>
              {main && (
                <>
                  <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.6, color: C.charcoal, maxWidth: "60ch" }}>
                    {main.brief?.subtitle ?? (
                      <>
                        {main.duration_minutes} of the {totalMinutes(agenda)} minutes are on this. It needs
                        your judgment, not your assent.
                      </>
                    )}
                  </p>
                  <div style={{ marginTop: 20 }}>
                    <Link
                      href={`/board/meetings/${meeting.id}#item-${main.position}`}
                      style={{
                        fontSize: 17,
                        fontWeight: 500,
                        color: C.ink,
                        borderBottom: `1px solid ${C.ruleStrong}`,
                        paddingBottom: 2,
                        textDecoration: "none",
                      }}
                    >
                      Read the decision brief
                    </Link>
                  </div>
                </>
              )}

              {decisions.length > 1 && (
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
                  <div style={eyebrow}>Also on the agenda, routine</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                    {decisions
                      .filter((d) => d.id !== main?.id)
                      .map((d) => (
                        <span key={d.id} style={{ fontSize: 15, lineHeight: 1.45, color: C.muted }}>
                          {d.brief?.decision ?? d.title}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </section>

            {/* What the 33 minutes are actually spent on. Deliberately NOT a
                list of options to choose between — it is the shape of the
                discussion, which is what makes the question above answerable. */}
            {main?.brief?.considerations && main.brief.considerations.length > 0 && (
              <section style={{ ...card, padding: 32 }}>
                <div style={eyebrow}>What we&rsquo;ll work through</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  {main.brief.considerations.map((c, i) => (
                    <div
                      key={c.label}
                      style={{
                        paddingTop: i === 0 ? 14 : 16,
                        paddingBottom: i === main.brief!.considerations!.length - 1 ? 0 : 16,
                        borderBottom:
                          i === main.brief!.considerations!.length - 1 ? "none" : `1px solid ${C.rule}`,
                      }}
                    >
                      <div style={{ fontFamily: F.heading, fontSize: 17, fontWeight: 600, color: C.ink }}>
                        {c.label}
                      </div>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 15,
                          lineHeight: 1.55,
                          color: C.charcoal,
                          maxWidth: "60ch",
                        }}
                      >
                        {c.note}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ── The organization at a glance ───────────────────────────── */}
        {stats.length > 0 && (
          <section style={{ marginTop: 64 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>
                The organization at a glance
              </h2>
              <span style={{ fontSize: 15, color: C.muted }}>Detail in the pre-read, section 3</span>
            </div>
            <div className="board-stat-row" style={{ marginTop: 20 }}>
              {stats.map((k) => (
                <div key={k.label} style={{ ...card, padding: 32 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif",
                      fontWeight: 800,
                      fontSize: 56,
                      lineHeight: 0.88,
                      color: C.ink,
                    }}
                  >
                    {k.value}
                  </div>
                  <div style={{ ...eyebrow, marginTop: 14 }}>{k.label}</div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: C.charcoal, marginTop: 8 }}>{k.note}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}

/** The decision that carries the most time is the meeting's real question. */
function mainQuestion(agenda: AgendaItem[]): AgendaItem | null {
  const decisions = agenda.filter((a) => a.item_type === "decision");
  if (!decisions.length) return null;
  return decisions.reduce((a, b) => ((b.duration_minutes ?? 0) > (a.duration_minutes ?? 0) ? b : a));
}

function questionFrom(item: AgendaItem): string {
  const d = item.brief?.decision;
  if (!d) return item.title;
  // "Adopt the price sheet." → "Should Ambition adopt the price sheet?"
  const s = d.replace(/\.$/, "");
  return `Should Ambition ${s.charAt(0).toLowerCase()}${s.slice(1)}?`;
}

function totalMinutes(agenda: AgendaItem[]): number {
  return agenda.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
}

async function getHeadlineStats(meetingId: string): Promise<Stat[]> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("board_meetings")
    .select("headline_stats")
    .eq("id", meetingId)
    .maybeSingle();
  const raw = (data?.headline_stats ?? []) as unknown;
  return Array.isArray(raw) ? (raw as Stat[]) : [];
}
