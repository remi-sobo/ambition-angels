import { redirect, notFound } from "next/navigation";
import { getBoardContext } from "@/lib/board/auth";
import { getMeeting, getAgenda, getMinutes, getFollowUps, getAttendance, getResolutions } from "@/lib/board/data";
import { longDate, timeRange, dateOnly, plainDate } from "@/lib/board/format";
import PrintTrigger from "../../../_components/PrintTrigger";
import { C, F } from "../../../_components/tokens";

export const dynamic = "force-dynamic";

/**
 * Minute book export (spec §5.9). NOT CUTTABLE.
 *
 * California corporate code obliges the organization to keep a minute book
 * that can be produced and printed at any time. Without this, Shannon keeps a
 * parallel record in Google Docs and the portal has failed at its main
 * administrative job.
 *
 * This is a print stylesheet over real HTML, not a separate rendering path —
 * the same `minutes.body` JSON and the same `agenda_items` rows the portal
 * reads. A second renderer would drift from the screen version, and the
 * drift would be invisible until an auditor found it.
 *
 * Two documents, chosen by meeting state:
 *   upcoming/live → the AGENDA: name, type, date, time, location, quorum,
 *                   the full agenda with owners and time boxes, and the
 *                   motions on the table.
 *   closed        → the MINUTES: called to order, adjourned, present, absent,
 *                   staff present, quorum, body sections, and every motion
 *                   with mover, seconder and tally including named abstentions.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { doc?: string };
}) {
  const ctx = await getBoardContext();
  if (!ctx) redirect("/board/signin");

  const meeting = await getMeeting(ctx.orgId, params.id);
  if (!meeting) notFound();

  const [agenda, minutes, followUps, attendance, resolutions] = await Promise.all([
    getAgenda(meeting.id),
    getMinutes(meeting.id),
    getFollowUps(meeting.id),
    getAttendance(meeting.id),
    getResolutions(ctx.orgId, meeting.id),
  ]);

  // The state picks the document; ?doc= overrides so Shannon can print an
  // agenda for a closed meeting or a minutes draft for a live one.
  const wants = searchParams.doc === "agenda" || searchParams.doc === "minutes" ? searchParams.doc : null;
  const kind = wants ?? (meeting.status === "closed" ? "minutes" : "agenda");

  const dateLabel = longDate(meeting.starts_at) || dateOnly(meeting.meeting_date, "long");
  const body = minutes?.body ?? {};

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100vh" }}>
      <PrintTrigger />

      <div className="board-print-header">
        <div className="spread">
          <span>Ambition Angels Inc.</span>
          <span>
            {kind === "minutes" ? "Minutes" : "Agenda"} · {dateLabel}
          </span>
        </div>
      </div>

      <div
        className="board-print-body"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "48px 32px 64px",
          fontFamily: "var(--font-body), 'DM Sans', sans-serif",
          color: C.ink,
        }}
      >
        <header style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: F.heading, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>
            Ambition Angels Inc. · A California nonprofit public benefit corporation · EIN 87-2513010
          </div>
          <h1 style={{ margin: "12px 0 0", fontFamily: F.heading, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }}>
            {meeting.title}
          </h1>
          <div style={{ fontSize: 14, color: C.charcoal, marginTop: 8, lineHeight: 1.6 }}>
            {kind === "minutes" ? "Minutes of the meeting held " : "Agenda for the meeting of "}
            {dateLabel}
            {meeting.starts_at ? `, ${timeRange(meeting.starts_at, meeting.ends_at)}` : ""}
            {meeting.location ? `, ${meeting.location}` : ""}.
            <br />
            {meeting.fiscal_label ? `${meeting.fiscal_label}. ` : ""}
            {meeting.meeting_type === "annual"
              ? "Designated the 2026 Annual Meeting under Section 6 of the Bylaws. "
              : ""}
            Quorum is {meeting.quorum_required} of 5 directors.
          </div>
        </header>

        {kind === "agenda" ? (
          <>
            <Section title="Agenda">
              {agenda.map((a) => (
                <div key={a.id} className="board-avoid-break" style={{ display: "flex", gap: 16, padding: "8px 0", borderBottom: `0.5pt solid ${C.rule}` }}>
                  <span style={{ flex: "none", width: 54, fontSize: 14, color: C.charcoal }}>{a.starts_at_label}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: F.heading, fontSize: 15, fontWeight: 600 }}>{a.title}</span>
                    <span style={{ display: "block", fontSize: 13, color: C.muted, marginTop: 2 }}>
                      {[
                        a.owner,
                        a.duration_minutes ? `${a.duration_minutes} min` : null,
                        // Whether the board is asked to move something, which
                        // is what a director scanning a printed agenda needs.
                        // An item typed a decision but carrying no motion (the
                        // officer election, completed by written ballot in
                        // July) is a record, not a vote.
                        a.item_type === "decision" && a.brief?.motion ? "Vote" : "No vote",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {a.description && (
                      <span style={{ display: "block", fontSize: 13, color: C.charcoal, marginTop: 4, lineHeight: 1.55 }}>
                        {a.description}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </Section>

            {agenda.some((a) => a.brief?.motion) && (
              <Section title="Motions on the table">
                {agenda
                  .filter((a) => a.brief?.motion)
                  .map((a, i) => (
                    <div key={a.id} className="board-decision" style={{ padding: "10px 0", borderBottom: `0.5pt solid ${C.rule}` }}>
                      <div style={{ fontSize: 13, color: C.muted }}>Motion {i + 1} · {a.title}</div>
                      <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.6 }}>{a.brief!.motion}</p>
                    </div>
                  ))}
              </Section>
            )}

            <Section title="Expected attendance">
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
                {["yes", "no", "unsure"].map((r) => {
                  const names = attendance.filter((a) => a.rsvp === r && !a.is_staff).map((a) => a.name);
                  if (!names.length) return null;
                  return (
                    <span key={r} style={{ display: "block" }}>
                      {r === "yes" ? "Confirmed" : r === "no" ? "Sends regrets" : "Unconfirmed"}: {names.join(", ")}.
                    </span>
                  );
                })}
                {attendance.filter((a) => a.is_staff).length > 0 && (
                  <span style={{ display: "block" }}>
                    Staff: {attendance.filter((a) => a.is_staff).map((a) => a.name).join(", ")}.
                  </span>
                )}
              </p>
            </Section>
          </>
        ) : (
          <>
            <Section title="Attendance and quorum">
              <Line label="Called to order" value={minutes?.called_to_order_at} />
              <Line label="Adjourned" value={minutes?.adjourned_at} />
              <Line label="Present" value={(body.present ?? []).join(", ")} />
              <Line label="Absent" value={(body.absent ?? []).join(", ") || "None"} />
              <Line label="Staff present" value={(body.staff_present ?? []).join(", ")} />
              <Line
                label="Quorum"
                value={minutes?.quorum_met === null || minutes?.quorum_met === undefined ? null : minutes.quorum_met ? "Met" : "Not met"}
              />
              <Line
                label="Approval"
                value={minutes?.approved_at ? `Approved ${plainDate(minutes.approved_at)}` : "Pending approval"}
              />
              {minutes?.signed_by && (
                <Line
                  label="Signed"
                  value={`${minutes.signed_by}${minutes.signed_at ? ` on ${plainDate(minutes.signed_at)}` : ""}`}
                />
              )}
            </Section>

            {!minutes ? (
              <p style={{ fontSize: 14, color: C.charcoal }}>
                Minutes for this meeting have not been drafted yet.
              </p>
            ) : (
              <Section title="Proceedings">
                {(Array.isArray(body.sections) ? body.sections : []).map((s, i) => {
                  if (s.type === "heading") {
                    return (
                      <h3 key={i} style={{ margin: i === 0 ? "0 0 6px" : "18px 0 6px", fontFamily: F.heading, fontSize: 15, fontWeight: 600 }}>
                        {s.text}
                      </h3>
                    );
                  }
                  if (s.type === "paragraph") {
                    return (
                      <p key={i} style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.65 }}>
                        {s.text}
                      </p>
                    );
                  }
                  const abst = s.abstained ?? [];
                  return (
                    <div key={i} className="board-decision" style={{ margin: "0 0 12px", border: `0.5pt solid ${C.ruleStrong}`, padding: 12 }}>
                      <p style={{ margin: 0, fontFamily: F.heading, fontSize: 14, fontWeight: 600, lineHeight: 1.55 }}>
                        {s.motion}
                      </p>
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: C.charcoal, lineHeight: 1.6 }}>
                        {[s.moved_by ? `Moved by ${s.moved_by}` : null, s.seconded_by ? `seconded by ${s.seconded_by}` : null]
                          .filter(Boolean)
                          .join(", ")}
                        {typeof s.for === "number"
                          ? `. ${s.outcome === "passed" ? "Carried" : "Failed"} ${s.for} to ${s.against ?? 0}`
                          : ""}
                        {abst.length ? `. Abstaining: ${abst.join(", ")}` : ""}
                        {s.note ? `. ${s.note}` : "."}
                      </p>
                    </div>
                  );
                })}
              </Section>
            )}

            {resolutions.length > 0 && (
              <Section title="Resolutions of record">
                {resolutions.map((r) => (
                  <div key={r.id} className="board-decision" style={{ padding: "10px 0", borderBottom: `0.5pt solid ${C.rule}` }}>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{r.motion_text}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>
                      {[r.moved_by ? `Moved by ${r.moved_by}` : null, r.seconded_by ? `seconded by ${r.seconded_by}` : null]
                        .filter(Boolean)
                        .join(", ")}
                      {typeof r.votes_for === "number" ? `${r.moved_by ? ". " : ""}${r.passed ? "Carried" : "Failed"} ${r.votes_for} to ${r.votes_against ?? 0}` : ""}
                      {r.abstentions?.length ? `. Abstaining: ${r.abstentions.join(", ")}` : ""}
                      {r.notes ? `. ${r.notes}` : ""}
                    </p>
                  </div>
                ))}
              </Section>
            )}

            {followUps.length > 0 && (
              <Section title="Follow-ups">
                {followUps.map((f) => (
                  <div key={f.id} style={{ padding: "6px 0", borderBottom: `0.5pt solid ${C.rule}`, fontSize: 14, lineHeight: 1.6 }}>
                    {f.description}
                    <span style={{ color: C.muted }}>
                      {" — "}
                      {[f.owner, f.due_date ? `due ${dateOnly(f.due_date, "plain")}` : null, f.status.replace("_", " ")]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            <div style={{ marginTop: 40, paddingTop: 40 }} className="board-avoid-break">
              <div style={{ borderTop: `0.5pt solid ${C.ink}`, width: 280, paddingTop: 6, fontSize: 13, color: C.charcoal }}>
                Secretary
              </div>
              <div style={{ marginTop: 20, borderTop: `0.5pt solid ${C.ink}`, width: 160, paddingTop: 6, fontSize: 13, color: C.charcoal }}>
                Date
              </div>
            </div>
          </>
        )}
      </div>

      <div className="board-print-footer" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          margin: "0 0 10px",
          fontFamily: F.heading,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: C.muted,
          borderBottom: `0.5pt solid ${C.ruleStrong}`,
          paddingBottom: 4,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: 1.8 }}>
      <span style={{ flex: "none", width: 130, color: C.muted }}>{label}</span>
      <span style={{ flex: 1 }}>{value}</span>
    </div>
  );
}
