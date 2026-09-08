import type { MinutesRecord, FollowUp, MinutesSection } from "@/lib/board/data";
import { plainDate, shortDate, followUpLabel } from "@/lib/board/format";
import { C, F, card, eyebrow } from "./tokens";

/**
 * The closed state: the agenda is replaced by the approved minutes (spec §5.5).
 *
 * Rendered from the `minutes.body` JSON rather than stored markup, so one
 * record renders three ways — this HTML, the print-to-PDF minute book, and a
 * section inside a packet. Decisions render as a bordered block with the
 * motion, mover, seconder and tally, with abstentions named, so a decision is
 * findable by scanning rather than by reading.
 */
export default function MinutesView({
  minutes,
  followUps,
  meetingTitle,
}: {
  minutes: MinutesRecord | null;
  followUps: FollowUp[];
  meetingTitle: string;
}) {
  if (!minutes) {
    return (
      <section style={{ ...card, padding: 32 }}>
        <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, color: C.ink }}>
          Minutes are being drafted
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 17, lineHeight: 1.6, color: C.muted, maxWidth: "68ch" }}>
          Shannon drafts the minutes from this agenda after the meeting. They are posted here for approval
          at the following meeting.
        </p>
      </section>
    );
  }

  const body = minutes.body ?? {};
  const sections: MinutesSection[] = Array.isArray(body.sections) ? body.sections : [];

  return (
    <>
      <section className="board-print-flat" style={{ ...card, padding: "clamp(24px,3vw,32px)" }}>
        <div style={eyebrow}>
          {minutes.approved_at ? `Approved ${plainDate(minutes.approved_at)}` : "Pending approval"}
        </div>
        <h2
          style={{
            margin: "12px 0 0",
            fontFamily: F.heading,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: C.ink,
          }}
        >
          Minutes
        </h2>

        {/* Header as a definition list: two columns on desktop, stacked on
            mobile, muted labels. Everything an auditor checks first. */}
        <dl
          className="board-minutes-facts"
          style={{
            margin: "20px 0 0",
            display: "grid",
            gridTemplateColumns: "minmax(120px,160px) 1fr",
            gap: "10px 24px",
            fontSize: 15,
          }}
        >
          <Fact label="Called to order" value={minutes.called_to_order_at} />
          <Fact label="Adjourned" value={minutes.adjourned_at} />
          <Fact label="Present" value={(body.present ?? []).join(", ")} />
          <Fact label="Absent" value={(body.absent ?? []).join(", ") || "None"} />
          <Fact label="Staff present" value={(body.staff_present ?? []).join(", ")} />
          <Fact
            label="Quorum"
            value={minutes.quorum_met === null ? null : minutes.quorum_met ? "Met" : "Not met"}
          />
        </dl>

        {minutes.signed_by && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.rule}`, fontSize: 15, color: C.muted }}>
            Signed record filed by {minutes.signed_by}
            {minutes.signed_at ? ` on ${plainDate(minutes.signed_at)}` : ""}.
          </div>
        )}
      </section>

      <section className="board-print-flat" style={{ ...card, padding: "clamp(24px,3vw,32px)", marginTop: 24 }}>
        {sections.map((s, i) => {
          if (s.type === "heading") {
            return (
              <h3
                key={i}
                style={{
                  margin: i === 0 ? 0 : "32px 0 0",
                  fontFamily: F.heading,
                  fontSize: 20,
                  fontWeight: 600,
                  color: C.ink,
                }}
              >
                {s.text}
              </h3>
            );
          }
          if (s.type === "paragraph") {
            return (
              <p key={i} style={{ margin: "12px 0 0", fontSize: 17, lineHeight: 1.65, color: C.charcoal, maxWidth: "68ch" }}>
                {s.text}
              </p>
            );
          }
          const abstained = s.abstained ?? [];
          return (
            <div
              key={i}
              className="board-decision"
              style={{
                marginTop: 18,
                border: `1px solid ${C.rule}`,
                borderRadius: 3,
                padding: 20,
              }}
            >
              <p style={{ margin: 0, fontFamily: F.heading, fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: C.ink, maxWidth: "62ch" }}>
                {s.motion}
              </p>
              <div style={{ marginTop: 10, fontSize: 15, color: C.muted, lineHeight: 1.6 }}>
                {[
                  s.moved_by ? `Moved by ${s.moved_by}` : null,
                  s.seconded_by ? `seconded by ${s.seconded_by}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                {typeof s.for === "number" ? `. ${s.outcome === "passed" ? "Carried" : "Failed"} ${s.for} to ${s.against ?? 0}` : ""}
                {abstained.length ? `. ${abstained.join(", ")} abstained` : ""}
                {s.note ? ` — ${s.note}` : "."}
              </div>
            </div>
          );
        })}
      </section>

      {followUps.length > 0 && (
        <section className="board-print-flat" style={{ ...card, marginTop: 24 }}>
          <div style={{ padding: "24px 28px 12px" }}>
            <h3 style={{ margin: 0, fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
              Follow-ups
            </h3>
            <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>
              What was committed at {meetingTitle}. This is what usually evaporates between meetings.
            </div>
          </div>
          {followUps.map((f) => (
            <div
              key={f.id}
              className="board-avoid-break"
              style={{ display: "flex", gap: 20, padding: "16px 28px", borderTop: `1px solid ${C.rule}`, flexWrap: "wrap" }}
            >
              <span
                style={{
                  flex: "none",
                  width: 112,
                  fontFamily: F.heading,
                  fontSize: 13,
                  fontWeight: f.status === "overdue" ? 700 : 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: f.status === "overdue" ? C.ink : C.muted,
                }}
              >
                {followUpLabel(f.status)}
              </span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, color: f.status === "done" ? C.muted : C.ink }}>
                  {f.description}
                </p>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>{f.owner}</div>
              </div>
              <span style={{ flex: "none", width: 120, textAlign: "right", fontSize: 15, color: f.status === "overdue" ? C.orangeDark : C.muted }}>
                {f.due_date ? `Due ${shortDate(new Date(f.due_date + "T12:00:00Z").toISOString())}` : ""}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "contents" }}>
      <dt style={{ color: C.muted }}>{label}</dt>
      <dd style={{ margin: 0, color: C.ink }}>{value}</dd>
    </div>
  );
}
