"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { AgendaItem, MeetingDoc } from "@/lib/board/data";
import { fileSize } from "@/lib/board/format";
import NoteBox from "./NoteBox";
import { C, F, card, eyebrow } from "./tokens";

/**
 * The agenda (spec §5.3 and §5.4).
 *
 * Rows separated by rule, expandable, with materials attached per item. In the
 * live state the current item lifts out of the list with a 3px orange left
 * border and auto-expands, and it updates for everyone in real time.
 *
 * Realtime degrades in two steps, because the meeting must never depend on it:
 * Supabase Realtime on agenda_items.status, falling back to a 15-second poll,
 * falling back to the agenda simply reading as a static list.
 */
export default function AgendaList({
  meetingId,
  items,
  docs,
  notes,
  canTakeNotes,
  live,
}: {
  meetingId: string;
  items: AgendaItem[];
  docs: MeetingDoc[];
  notes: Record<string, string>;
  canTakeNotes: boolean;
  live: boolean;
}) {
  const [rows, setRows] = useState(items);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => setRows(items), [items]);

  // ── Live sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function refetch() {
      try {
        const res = await fetch(`/api/board/meetings/${meetingId}/agenda`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { items?: AgendaItem[] };
        if (!cancelled && body.items) setRows(body.items);
      } catch {
        /* the static list is still correct */
      }
    }

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(refetch, 15_000);
    };

    let channel: ReturnType<ReturnType<typeof getSupabaseBrowser>["channel"]> | null = null;
    try {
      channel = getSupabaseBrowser()
        .channel(`board-agenda-${meetingId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "agenda_items", filter: `meeting_id=eq.${meetingId}` },
          refetch,
        )
        .subscribe((status) => {
          // Any non-subscribed terminal state means realtime is not working
          // here; fall back rather than leaving the agenda frozen.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") startPolling();
        });
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (channel) getSupabaseBrowser().removeChannel(channel);
    };
  }, [live, meetingId]);

  // Gently scroll the current item into view when it changes, unless the
  // director has scrolled by hand in the last 20 seconds.
  const currentId = rows.find((r) => r.status === "current")?.id ?? null;
  useEffect(() => {
    if (!live || !currentId) return;
    let lastManual = 0;
    const onScroll = () => (lastManual = Date.now());
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });
    const t = setTimeout(() => {
      if (Date.now() - lastManual < 20_000) return;
      document.getElementById(`agenda-${currentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("touchmove", onScroll);
    };
  }, [currentId, live]);

  const docsFor = (item: AgendaItem) =>
    docs.filter((d) => matchesItem(d, item));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((item) => {
        const isCurrent = live && item.status === "current";
        const isDone = live && item.status === "done";
        const expanded = isCurrent || open === item.id;
        const itemDocs = docsFor(item);

        if (isDone && !expanded) {
          return (
            <button
              key={item.id}
              id={`agenda-${item.id}`}
              type="button"
              onClick={() => setOpen(item.id)}
              className="board-row"
              style={{
                ...card,
                background: C.cream,
                padding: "18px 28px",
                display: "flex",
                gap: 20,
                alignItems: "center",
                cursor: "pointer",
                textAlign: "left",
                font: "inherit",
                width: "100%",
              }}
            >
              <span style={{ flex: "none", width: 72, display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 7.2L5.2 10.4L12 3.4" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif", fontWeight: 700, fontSize: 20, color: C.muted }}>
                  {item.starts_at_label}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: F.heading, fontSize: 17, fontWeight: 500, color: C.muted }}>
                {item.title}
              </span>
              <span style={{ flex: "none", fontSize: 15, color: C.muted }}>Done</span>
            </button>
          );
        }

        return (
          <section
            key={item.id}
            id={`agenda-${item.id}`}
            className="board-avoid-break"
            style={{
              ...card,
              borderLeft: isCurrent ? `3px solid ${C.orange}` : `1px solid ${C.rule}`,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpen(expanded && !isCurrent ? null : item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(expanded && !isCurrent ? null : item.id);
                }
              }}
              className="board-row"
              style={{ display: "flex", gap: 20, padding: "24px 28px", cursor: "pointer", flexWrap: "wrap" }}
            >
              <span
                style={{
                  flex: "none",
                  width: 72,
                  fontFamily: "var(--font-display), 'Big Shoulders Display', sans-serif",
                  fontWeight: 700,
                  fontSize: 22,
                  lineHeight: 1.15,
                  color: C.ink,
                }}
              >
                {item.starts_at_label}
              </span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                {isCurrent && <div style={{ ...eyebrow, color: C.muted, marginBottom: 6 }}>On now</div>}
                <div style={{ fontFamily: F.heading, fontSize: 20, fontWeight: 500, lineHeight: 1.35, color: C.ink }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 5 }}>
                  {[item.owner, item.duration_minutes ? `${item.duration_minutes} min` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span
                style={{
                  flex: "none",
                  fontFamily: F.heading,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  height: "fit-content",
                  padding: "5px 9px",
                  borderRadius: 4,
                  // A VOTE chip is filled ink; everything else is rule-bordered.
                  // Status is carried by weight and label, never by color.
                  background: isVote(item) ? C.ink : "transparent",
                  color: isVote(item) ? C.cream : C.charcoal,
                  border: isVote(item) ? "none" : `1px solid ${C.rule}`,
                }}
              >
                {isVote(item) ? "Vote" : "No vote"}
              </span>
            </div>

            {expanded && (
              <div style={{ padding: "0 28px 28px", marginLeft: 0 }}>
                {item.description && (
                  <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: C.charcoal, maxWidth: "68ch" }}>
                    {item.description}
                  </p>
                )}

                {itemDocs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                    {itemDocs.map((d) => (
                      <a
                        key={d.id}
                        className="board-row"
                        href={`/api/board/documents/${d.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 16,
                          border: `1px solid ${C.rule}`,
                          borderRadius: 3,
                          padding: "14px 16px",
                          background: C.cream,
                          textDecoration: "none",
                          color: C.ink,
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{d.title}</span>
                          <span style={{ display: "block", fontSize: 15, color: C.muted }}>{fileSize(d.size_bytes)}</span>
                        </span>
                        <span className="board-open" style={{ flex: "none", fontSize: 15, fontWeight: 500, borderBottom: `1px solid ${C.ruleStrong}` }}>
                          Open
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                {item.brief && <DecisionBrief brief={item.brief} />}

                {canTakeNotes && (
                  <NoteBox meetingId={meetingId} agendaItemId={item.id} initial={notes[item.id] ?? ""} />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * An item is a vote when the board is actually asked to move something: it is
 * typed a decision AND carries motion text. "Annual meeting business" is the
 * case this exists for — the officer election was completed by written ballot
 * in July, so the item is a record, and a chip reading DECISION on it told
 * directors they were voting on something already effective.
 */
function isVote(item: AgendaItem): boolean {
  return item.item_type === "decision" && !!item.brief?.motion;
}

/** The decision brief: what is being decided, what staff recommends, why now,
 *  the tradeoff, and the motion text a director is actually voting on. An item
 *  with no motion renders the same block headed "For the record" instead. */
function DecisionBrief({ brief }: { brief: NonNullable<AgendaItem["brief"]> }) {
  const isRecord = !brief.motion;
  const rows: [string, string | undefined][] = [
    ["Decision", brief.decision],
    ["Staff recommends", brief.recommends],
    ["Why now", brief.why],
    ["The tradeoff", brief.tradeoff],
  ];
  return (
    <div
      className="board-avoid-break"
      style={{ marginTop: 24, border: `1px solid ${C.rule}`, borderRadius: 3, padding: 24, background: C.white }}
    >
      <div style={eyebrow}>{isRecord ? "For the record" : "Decision brief"}</div>

      {brief.considerations && brief.considerations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          {brief.considerations.map((c, i) => (
            <div
              key={c.label}
              style={{
                paddingTop: i === 0 ? 6 : 16,
                paddingBottom: i === brief.considerations!.length - 1 ? 0 : 16,
                borderBottom: i === brief.considerations!.length - 1 ? "none" : `1px solid ${C.rule}`,
              }}
            >
              <div style={{ fontFamily: F.heading, fontSize: 16, fontWeight: 600, color: C.ink }}>{c.label}</div>
              <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.55, color: C.charcoal, maxWidth: "60ch" }}>
                {c.note}
              </p>
            </div>
          ))}
        </div>
      )}
      <dl className="board-brief-grid" style={{ margin: "20px 0 0", display: "grid", gridTemplateColumns: "minmax(120px,150px) 1fr", gap: "16px 24px" }}>
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt style={{ fontSize: 15, color: C.muted }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: k === "Decision" || k === "Staff recommends" ? C.ink : C.charcoal, maxWidth: "60ch", fontFamily: k === "Decision" ? F.heading : F.body, fontWeight: k === "Decision" ? 500 : 400 }}>
                {v}
              </dd>
            </div>
          ))}
      </dl>
      {brief.motion && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
          <div style={eyebrow}>What you are voting on</div>
          <p style={{ margin: "14px 0 0", fontFamily: F.heading, fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: C.ink, maxWidth: "60ch" }}>
            {brief.motion}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Which materials belong to which agenda item.
 *
 * Documents attach to the meeting, not to the item (that is how the existing
 * document_links table works), so the pairing is by doc_type naming
 * convention: a document typed "agenda:2" hangs off position 2. Anything
 * untyped stays in the flat Materials list only, which is the safe default —
 * a document never disappears, it just may not be duplicated under an item.
 */
function matchesItem(doc: MeetingDoc, item: AgendaItem): boolean {
  const t = doc.doc_type ?? "";
  if (!t.startsWith("agenda:")) return false;
  return t
    .slice("agenda:".length)
    .split(",")
    .map((s) => s.trim())
    .includes(String(item.position));
}
