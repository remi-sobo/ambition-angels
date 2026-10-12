"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TYPE } from "@/lib/admin/typeScale";
import {
  DEST_LABEL,
  canConfirm,
  cardText,
  confirmAllSummary,
  entityMeta,
  entityName,
  filedHref,
  filedLabel,
  heldTitle,
  orderCards,
  sourceSentence,
  stackCounts,
  undoSecondsLeft,
  whatConfirmDoes,
  type CaptureView,
  type CardView,
} from "../_lib/cardView";
import { cardAction, confirmAllCards, getCapture } from "../_lib/captureApi";
import { formatElapsed } from "@/lib/hooks/continuousSpeech";
import EditSheet from "./EditSheet";
import PickMatch from "./PickMatch";

/**
 * "Here's what I heard" (specs/bloomos-capture.md, Desired behavior; C4).
 *
 * The stack of proposed cards for one capture. Held cards sit on top and can't
 * be confirmed until a pick. Every action goes through the C3 card routes;
 * nothing here knows a destination table. Used by the record modal and by
 * /admin/capture/[id] (resume, and where filed tasks link back to).
 */
export default function ConfirmStack({
  captureId,
  initial,
  onAllDone,
}: {
  captureId: string;
  initial?: { capture: CaptureView; cards: CardView[] };
  /** Called when nothing is left proposed or held. */
  onAllDone?: () => void;
}) {
  const [capture, setCapture] = useState<CaptureView | null>(initial?.capture ?? null);
  const [cards, setCards] = useState<CardView[]>(initial?.cards ?? []);
  const [loading, setLoading] = useState(!initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<CardView | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [allBusy, setAllBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const r = await getCapture(captureId);
    if (r.ok) {
      setCapture(r.data.capture);
      setCards(r.data.cards);
      setLoadError(null);
    } else {
      setLoadError(r.error);
    }
    setLoading(false);
  }, [captureId]);

  useEffect(() => {
    if (!initial) void reload();
  }, [initial, reload]);

  // Tick once a second while any filed card is still inside its undo window.
  const anyUndo = cards.some((c) => undoSecondsLeft(c, now) > 0);
  useEffect(() => {
    if (!anyUndo) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyUndo]);

  const counts = useMemo(() => stackCounts(cards), [cards]);
  const ordered = useMemo(() => orderCards(cards), [cards]);

  useEffect(() => {
    if (!loading && cards.length > 0 && counts.pending === 0) onAllDone?.();
  }, [loading, cards.length, counts.pending, onAllDone]);

  const replace = (card: CardView) => setCards((cs) => cs.map((c) => (c.id === card.id ? card : c)));

  const act = async (card: CardView, action: "confirm" | "discard" | "undo" | "edit", patch?: Record<string, unknown>) => {
    setBusy((b) => ({ ...b, [card.id]: true }));
    setErrors((e) => ({ ...e, [card.id]: "" }));
    setSummary(null);
    const r = await cardAction(card.id, action, patch);
    setBusy((b) => ({ ...b, [card.id]: false }));
    if (r.ok) {
      replace(r.data.card);
      setNow(Date.now());
      return true;
    }
    // 409: something changed underneath; show the current state.
    if (r.status === 409) await reload();
    setErrors((e) => ({ ...e, [card.id]: r.error }));
    return false;
  };

  const confirmAll = async () => {
    setAllBusy(true);
    setSummary(null);
    const r = await confirmAllCards(captureId);
    setAllBusy(false);
    if (!r.ok) {
      setSummary(r.error);
      return;
    }
    const failed: Record<string, string> = {};
    for (const x of r.data.results) if (!x.ok && x.error) failed[x.id] = x.error;
    setErrors((e) => ({ ...e, ...failed }));
    setSummary(confirmAllSummary(r.data));
    await reload();
    setNow(Date.now());
  };

  if (loading) {
    return <p className={`${TYPE.bodyMuted} py-6`}>Loading your cards…</p>;
  }
  if (loadError && !capture) {
    return (
      <div className="py-6 space-y-3">
        <p className={TYPE.body}>{loadError}</p>
        <button type="button" onClick={() => void reload()} className="min-h-[52px] text-sm font-semibold text-orange">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={TYPE.modalTitle}>Here&apos;s what I heard</h2>
          <p className={`${TYPE.metadata} mt-0.5`}>
            {cards.length === 0
              ? "No cards came out of this one."
              : counts.pending === 0
                ? "All sorted."
                : `${counts.pending} to go${counts.held ? `, ${counts.held} ${counts.held === 1 ? "needs" : "need"} a pick` : ""}.`}
          </p>
        </div>
        {counts.proposed > 1 && (
          <button
            type="button"
            onClick={() => void confirmAll()}
            disabled={allBusy}
            className={`${TYPE.button} min-h-[52px] rounded-control bg-orange px-4 text-white transition-colors hover:bg-orange-dark disabled:opacity-50`}
          >
            {allBusy ? "Filing…" : `Confirm all ${counts.proposed}`}
          </button>
        )}
      </div>

      {summary && (
        <p role="status" className={`${TYPE.body} rounded-control border border-hairline bg-tile px-3 py-2`}>
          {summary}
        </p>
      )}

      {cards.length === 0 && capture?.transcript && (
        <p className={TYPE.bodyMuted}>
          Nothing in that note looked like something to file. Open the transcript below if you want to copy it into a task.
        </p>
      )}

      <ul className="space-y-3">
        {ordered.map((card) => (
          <li key={card.id}>
            <CardItem
              card={card}
              now={now}
              busy={!!busy[card.id]}
              error={errors[card.id] || null}
              onConfirm={() => void act(card, "confirm")}
              onDiscard={() => void act(card, "discard")}
              onUndo={() => void act(card, "undo")}
              onEdit={() => setEditing(card)}
              onPick={(patch) => act(card, "edit", patch)}
            />
          </li>
        ))}
      </ul>

      {capture?.transcript && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="min-h-[52px] text-sm font-semibold text-ink-2 hover:text-ink-1"
          >
            {showTranscript ? "Hide transcript" : "See transcript"}
          </button>
          {showTranscript && (
            <p className={`${TYPE.bodyMuted} whitespace-pre-wrap rounded-control border border-hairline bg-tile p-3`}>
              {capture.transcript}
            </p>
          )}
        </div>
      )}

      {editing && (
        <EditSheet
          card={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const ok = await act(editing, "edit", patch);
            if (ok) setEditing(null);
            return ok ? null : "That edit didn't save. Check the card for details.";
          }}
        />
      )}
    </div>
  );
}

function DestTag({ card }: { card: CardView }) {
  return (
    <span className={`${TYPE.badge} inline-flex items-center rounded-full border border-hairline bg-tile px-2 py-0.5 text-ink-2`}>
      {DEST_LABEL[card.dest]}
      {card.dest === "thought" ? " · parking lot" : ""}
    </span>
  );
}

function CardItem({
  card,
  now,
  busy,
  error,
  onConfirm,
  onDiscard,
  onUndo,
  onEdit,
  onPick,
}: {
  card: CardView;
  now: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onDiscard: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onPick: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [showSource, setShowSource] = useState(false);
  const name = entityName(card);
  const meta = entityMeta(card);
  const text = cardText(card);
  const source = sourceSentence(card);
  const held = card.status === "held";
  const filed = card.status === "confirmed";
  const discarded = card.status === "discarded";
  const undoLeft = undoSecondsLeft(card, now);
  const href = filedHref(card);

  if (discarded) {
    return (
      <div className="rounded-panel border border-hairline px-4 py-3 opacity-60">
        <p className={`${TYPE.metadata} line-through`}>{text || DEST_LABEL[card.dest]}</p>
      </div>
    );
  }

  return (
    <article
      className={`rounded-panel border px-4 py-3 ${held ? "border-orange/60 bg-orange/[0.06]" : "border-hairline bg-surface"}`}
      aria-busy={busy}
    >
      <DestTag card={card} />
      {name && !held && (
        <div className="mt-2 min-w-0">
          <p className={`${TYPE.cardTitle} truncate`}>{name}</p>
          {meta && <p className={`${TYPE.metadata} truncate`}>{meta}</p>}
        </div>
      )}

      {held && <h3 className={`${TYPE.cardTitle} mt-2`}>{heldTitle(card)}</h3>}

      {text && (
        <button
          type="button"
          onClick={() => source && setShowSource((v) => !v)}
          className={`${TYPE.body} mt-2 block w-full text-left ${source ? "cursor-pointer" : "cursor-default"}`}
          aria-expanded={source ? showSource : undefined}
        >
          {text}
        </button>
      )}
      {showSource && source && (
        <p className={`${TYPE.metadata} mt-1.5 border-l-2 border-hairline pl-2 italic`}>You said: &ldquo;{source}&rdquo;</p>
      )}

      {held ? (
        <PickMatch card={card} disabled={busy} onPick={onPick} />
      ) : (
        !filed && <p className={`${TYPE.metadata} mt-2`}>{whatConfirmDoes(card)}</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-expense">
          {error}
        </p>
      )}

      {filed ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-revenue">
            {href ? (
              <Link href={href} className="underline-offset-2 hover:underline">
                {filedLabel(card)}
              </Link>
            ) : (
              filedLabel(card)
            )}
          </span>
          {undoLeft > 0 && (
            <button
              type="button"
              onClick={onUndo}
              disabled={busy}
              className="min-h-[52px] px-2 text-sm font-semibold text-ink-2 hover:text-ink-1 disabled:opacity-50"
            >
              {busy ? "Undoing…" : `Undo (${formatElapsed(undoLeft)})`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!held && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !canConfirm(card)}
              className={`${TYPE.button} min-h-[52px] flex-1 rounded-control bg-orange px-4 text-white transition-colors hover:bg-orange-dark disabled:opacity-50 sm:flex-none`}
            >
              {busy ? "Filing…" : "Confirm"}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className={`${TYPE.button} min-h-[52px] rounded-control border border-hairline px-4 text-ink-1 hover:bg-tile disabled:opacity-50`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            className={`${TYPE.button} min-h-[52px] rounded-control px-3 text-ink-2 hover:text-ink-1 disabled:opacity-50`}
          >
            Discard
          </button>
        </div>
      )}
    </article>
  );
}
