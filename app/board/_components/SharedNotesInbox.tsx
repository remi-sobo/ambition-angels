import type { SharedNote } from "@/lib/board/data";
import { plainDate } from "@/lib/board/format";
import { C, F, card, eyebrow } from "./tokens";

/**
 * What directors chose to send the Chair (board.write only).
 *
 * These are NOT their private notes. member_notes has no read path for anyone
 * but its author, here or in the database. Every row below was copied here by
 * the director named on it, by pressing send. If this panel is empty, nobody
 * sent anything — it does not mean nobody wrote anything, and there is
 * deliberately no way to find out from this screen.
 */
export default function SharedNotesInbox({
  notes,
  titleOf,
}: {
  notes: SharedNote[];
  titleOf: (agendaItemId: string | null) => string;
}) {
  return (
    <section className="board-noprint" style={{ ...card, padding: 28 }}>
      <div style={eyebrow}>Board admin</div>
      <h3 style={{ margin: "10px 0 0", fontFamily: F.heading, fontSize: 20, fontWeight: 600, color: C.ink }}>
        Notes directors sent you
      </h3>
      {notes.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.55, color: C.muted }}>
          Nothing sent yet. Directors&rsquo; own notes stay private — this only ever shows what one of
          them chose to pass on.
        </p>
      ) : (
        <div style={{ marginTop: 14 }}>
          {notes.map((n, i) => (
            <div
              key={n.id}
              style={{
                paddingTop: i === 0 ? 0 : 16,
                paddingBottom: i === notes.length - 1 ? 0 : 16,
                borderBottom: i === notes.length - 1 ? "none" : `1px solid ${C.rule}`,
              }}
            >
              <div style={{ fontFamily: F.heading, fontSize: 15, fontWeight: 600, color: C.ink }}>
                {n.author ?? "A director"}
              </div>
              <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>
                {titleOf(n.agenda_item_id)} · {plainDate(n.created_at)}
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: C.charcoal,
                  whiteSpace: "pre-wrap",
                }}
              >
                {n.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
