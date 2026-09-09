import Link from "next/link";
import type { MeetingDoc, Resolution, FollowUp } from "@/lib/board/data";
import { fileSize, shortDate, followUpLabel, tallyLabel, firstSentence } from "@/lib/board/format";
import MaterialActions from "./MaterialActions";
import { C, F, card, eyebrow } from "./tokens";

/** Running header for the printed minute book. Screen-hidden, print-fixed. */
export function PrintHeader({ title, date, kind }: { title: string; date: string; kind: string }) {
  return (
    <div className="board-print-header">
      <div className="spread">
        <span>Ambition Angels Inc. · {kind}</span>
        <span>
          {title} · {date}
        </span>
      </div>
    </div>
  );
}

/** Page numbers, via a CSS counter (see board.css). */
export function PrintFooter() {
  return <div className="board-print-footer" />;
}

/**
 * Materials: a flat list of everything, for the director who wants the lot.
 *
 * Per-agenda-item attachment is the more important pattern (it lives in
 * AgendaList) — one undifferentiated board packet PDF is how boards stop
 * reading. This list exists alongside it, not instead of it.
 */
export function MaterialsList({
  docs,
  meetingId,
  canManage = false,
}: {
  docs: MeetingDoc[];
  meetingId: string;
  canManage?: boolean;
}) {
  return (
    <section style={{ ...card }}>
      <div style={{ padding: "28px 28px 16px" }}>
        <h3 style={{ margin: 0, fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
          Materials
        </h3>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>
          {docs.length === 0
            ? "Nothing posted yet."
            : `${docs.length} document${docs.length === 1 ? "" : "s"} for this meeting.`}
        </div>
      </div>
      {docs.map((d) => {
        const meta = [d.mime?.includes("pdf") ? "PDF" : d.doc_type, fileSize(d.size_bytes)]
          .filter(Boolean)
          .join(" · ");

        // A director sees the whole row as one link. An admin gets the same
        // row with controls beside it, so the row cannot be a link any more:
        // a button inside an anchor is invalid and swallows the click.
        if (!canManage) {
          return (
            <a
              key={d.id}
              className="board-row"
              href={`/api/board/documents/${d.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 28px",
                borderTop: `1px solid ${C.rule}`,
                textDecoration: "none",
                color: C.ink,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{d.title}</span>
                <span style={{ display: "block", fontSize: 15, color: C.muted }}>{meta}</span>
              </span>
              <span className="board-open" style={{ flex: "none", fontSize: 15, fontWeight: 500, borderBottom: `1px solid ${C.ruleStrong}` }}>
                Open
              </span>
            </a>
          );
        }

        return (
          <div
            key={d.id}
            style={{ padding: "16px 28px", borderTop: `1px solid ${C.rule}`, color: C.ink }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{d.title}</span>
                <span style={{ display: "block", fontSize: 15, color: C.muted }}>{meta}</span>
              </span>
              <a
                className="board-open"
                href={`/api/board/documents/${d.id}`}
                style={{ flex: "none", fontSize: 15, fontWeight: 500, color: C.ink, textDecoration: "none", borderBottom: `1px solid ${C.ruleStrong}` }}
              >
                Open
              </a>
            </div>
            <div className="board-noprint" style={{ marginTop: 8 }}>
              <MaterialActions meetingId={meetingId} documentId={d.id} title={d.title ?? "this document"} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * "Since we last met" — the continuity surface, and the difference between a
 * board that remembers and one that re-litigates.
 *
 * An item sitting at OVERDUE across two meetings is visible to the whole
 * board. That is the feature working, not a bug to soften — so OVERDUE renders
 * ink-bold with the due date in orange, the one place a second accent is
 * permitted on this screen. Every other state is carried by weight and label.
 */
export function SinceWeLastMet({
  priorDate,
  priorId,
  resolutions,
  followUps,
}: {
  priorDate: string;
  priorId: string;
  resolutions: Resolution[];
  followUps: FollowUp[];
}) {
  const overdue = followUps.filter((f) => f.status === "overdue").length;
  const order: Record<FollowUp["status"], number> = { overdue: 0, in_progress: 1, not_pursued: 2, done: 3 };
  const sorted = [...followUps].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <section style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "28px 28px 20px" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontFamily: F.heading, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", color: C.ink }}>
            Since we last met
          </h2>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: C.muted, marginTop: 6 }}>{priorDate}</div>
        </div>
        {overdue > 0 && (
          <span style={{ flex: "none", fontSize: 15, fontWeight: 600, color: C.ink }}>{overdue} overdue</span>
        )}
      </div>

      {resolutions.length > 0 && (
        <>
          <div style={{ padding: "16px 28px 8px", borderTop: `1px solid ${C.rule}` }}>
            <div style={eyebrow}>What the board decided</div>
          </div>
          <div style={{ padding: "0 28px 20px" }}>
            {resolutions.map((r, i) => (
              <div
                key={r.id}
                className="board-avoid-break"
                style={{
                  padding: "14px 0",
                  borderBottom: i < resolutions.length - 1 ? `1px solid ${C.rule}` : "none",
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                }}
              >
                <p style={{ margin: 0, flex: "1 1 260px", minWidth: 0, fontSize: 17, lineHeight: 1.45, color: C.ink }}>
                  {r.motion_text}
                </p>
                <span style={{ flex: "none", width: 150, fontSize: 15, color: C.muted, textAlign: "right" }}>
                  {tallyLabel(r)}
                  {r.abstentions?.length ? (
                    <>
                      <br />
                      {r.abstentions.map((a) => a.split(/\s+/).slice(-1)[0]).join(", ")} abstained
                    </>
                  ) : typeof r.votes_for !== "number" && r.notes ? (
                    // A motion with no tally needs to say HOW it was adopted,
                    // or "Carried" alone reads as a missing vote count.
                    <>
                      <br />
                      {firstSentence(r.notes)}
                    </>
                  ) : null}
                </span>
              </div>
            ))}
            <div style={{ paddingTop: 16, borderTop: `1px solid ${C.rule}` }}>
              <Link
                href={`/board/meetings/${priorId}`}
                className="board-open"
                style={{ fontSize: 15, fontWeight: 500, color: C.ink, borderBottom: `1px solid ${C.ruleStrong}`, textDecoration: "none" }}
              >
                Read the {priorDate} minutes
              </Link>
            </div>
          </div>
        </>
      )}

      {sorted.length > 0 && (
        <>
          <div style={{ padding: "16px 28px 8px", borderTop: `1px solid ${C.rule}` }}>
            <div style={eyebrow}>Open items</div>
          </div>
          <div style={{ padding: "0 28px 28px" }}>
            {sorted.map((f, i) => {
              const isOverdue = f.status === "overdue";
              const isDone = f.status === "done";
              return (
                <div
                  key={f.id}
                  className="board-avoid-break"
                  style={{
                    padding: "16px 0",
                    borderBottom: i < sorted.length - 1 ? `1px solid ${C.rule}` : "none",
                    display: "flex",
                    gap: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 112,
                      fontFamily: F.heading,
                      fontSize: 13,
                      fontWeight: isOverdue ? 700 : 600,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: isOverdue ? C.ink : C.muted,
                      paddingTop: 3,
                    }}
                  >
                    {followUpLabel(f.status)}
                  </span>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 17,
                        fontWeight: isOverdue ? 600 : isDone ? 400 : 500,
                        lineHeight: 1.45,
                        color: isDone ? C.muted : C.ink,
                      }}
                    >
                      {f.description}
                    </p>
                    <div style={{ fontSize: 15, color: isOverdue ? C.ink : C.muted, marginTop: 4, fontWeight: isOverdue ? 500 : 400 }}>
                      <span style={{ textDecoration: isDone ? "line-through" : "none" }}>{f.owner}</span>
                      {f.note ? ` · ${f.note}` : ""}
                    </div>
                  </div>
                  <span
                    style={{
                      flex: "none",
                      width: 120,
                      textAlign: "right",
                      fontSize: 15,
                      fontWeight: isOverdue ? 600 : 400,
                      color: isOverdue ? C.orangeDark : C.muted,
                    }}
                  >
                    {f.due_date ? `Due ${shortDate(new Date(f.due_date + "T12:00:00Z").toISOString())}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
