"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TodayObligation } from "@/lib/admin/today";
import type { AckContext } from "@/lib/admin/ackContext";
import { ackAmount, ackShortDate, ordinalLabel } from "@/lib/admin/ackFormat";
import { ACK_CHANNELS, CHANNEL_LABEL, isAckChannel } from "@/lib/fundraising/ack-channels";
import Alert from "../../../_components/ui/Alert";
import { Field, Select } from "../../../_components/ui/Input";
import { TYPE } from "@/lib/admin/typeScale";
import AckDraft from "./AckDraft";

/**
 * The acknowledgment panel (specs/needs-you-popout-thank-yous.md, PR 3): the
 * gift, the donor's history, notes, how to reach them, and what the
 * stewardship matrix recommends. The shell's primary button ("Mark thanked")
 * records it through /api/admin/acknowledgments/mark with the channel chosen
 * here, after the shell's 5-second undo window.
 *
 * A thank-you's own tasks are folded into the row (foldAckTasks). The ack-
 * bridge task closes with the thank-you on its own; an escalation ("Personally
 * thank…") is the owner's touch, so it closes only when the box says so.
 */

export type AckChoice = { channel: string; alsoClose: string[] };

const PERSONAL = new Set(["call", "letter", "in_person", "text"]);

export default function AckPanel({
  row,
  onAckChoice,
}: {
  row: TodayObligation;
  onAckChoice?: (choice: AckChoice) => void;
}) {
  const [ctx, setCtx] = useState<AckContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canDraft, setCanDraft] = useState(false);
  const [channel, setChannel] = useState("email");
  const [closeIds, setCloseIds] = useState<Set<string>>(new Set());
  const today = new Date().toISOString().slice(0, 10);
  const escalations = (row.linkedTasks ?? []).filter((t) => t.kind === "escalation");
  const ackTasks = (row.linkedTasks ?? []).filter((t) => t.kind === "ack");

  useEffect(() => {
    let alive = true;
    setCtx(null);
    setCanDraft(false);
    setLoadError(null);
    fetch(`/api/admin/acknowledgments/context?gift_id=${row.source_id}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { context?: AckContext; canDraft?: boolean; error?: string } | null;
        if (!alive) return;
        if (!r.ok || !j?.context) {
          setLoadError(j?.error ?? "Couldn't load this gift.");
          return;
        }
        setCtx(j.context);
        setCanDraft(j.canDraft === true);
        const c = isAckChannel(j.context.recommendation.channel) ? j.context.recommendation.channel : "email";
        setChannel(c);
        // Done personally → the "Personally thank" task is done too, by
        // default; an email thank-you leaves the owner's touch open.
        setCloseIds(new Set(PERSONAL.has(c) ? escalations.map((t) => t.id) : []));
      })
      .catch(() => alive && setLoadError("Couldn't load this gift."));
    return () => {
      alive = false;
    };
    // escalations derive from the row; reload only per gift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.source_id]);

  useEffect(() => {
    onAckChoice?.({ channel, alsoClose: Array.from(closeIds) });
  }, [channel, closeIds, onAckChoice]);

  if (loadError) return <p className={TYPE.bodyMuted}>{loadError}</p>;
  if (!ctx) return <p className={TYPE.bodyMuted}>Loading the gift…</p>;

  const { donor, history, recommendation: rec } = ctx;
  const given = [ctx.campaign && `Campaign: ${ctx.campaign}`, ctx.fund && `Fund: ${ctx.fund}`, ctx.appeal && `Appeal: ${ctx.appeal}`].filter(Boolean);

  return (
    <div className="space-y-4">
      {donor.doNotContact && (
        <Alert tone="warning">
          {donor.name} is marked do not contact. Don&apos;t reach out. Record a thank-you here only if it already happened.
        </Alert>
      )}
      {rec.major && !donor.doNotContact && (
        <Alert tone="info">
          Major gift. A call or handwritten note is recommended before any email
          {rec.escalationOwner ? `, from ${rec.escalationOwner.charAt(0).toUpperCase()}${rec.escalationOwner.slice(1)}` : ""}.
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className={TYPE.metadata}>Gift</dt>
          <dd className={TYPE.body}>
            {ackAmount(ctx.amount)} · {ackShortDate(ctx.giftDate, today)}
          </dd>
        </div>
        <div>
          <dt className={TYPE.metadata}>Source</dt>
          <dd className={TYPE.body}>{ctx.sourceLabel}</dd>
        </div>
        <div>
          <dt className={TYPE.metadata}>Giving history</dt>
          <dd className={TYPE.body}>
            {ordinalLabel(history.ordinal)} of {history.lifetimeCount} · {ackAmount(history.lifetimeTotal)} lifetime
          </dd>
        </div>
        <div>
          <dt className={TYPE.metadata}>Before this</dt>
          <dd className={TYPE.body}>
            {history.previous
              ? `${ackAmount(history.previous.amount)} · ${ackShortDate(history.previous.date, today)}`
              : "First gift"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className={TYPE.metadata}>Reach them</dt>
          <dd className={TYPE.body}>
            {donor.email ?? "No email on file"}
            {donor.id && (
              <>
                {" · "}
                <Link href={row.href} className="underline underline-offset-2 hover:text-ink-1">
                  Donor profile
                </Link>
              </>
            )}
          </dd>
        </div>
      </dl>

      {(ctx.notes || donor.whyMatters || given.length > 0) && (
        <div className="space-y-1">
          {ctx.notes && <p className={TYPE.body}>Note on this gift: {ctx.notes}</p>}
          {donor.whyMatters && <p className={TYPE.bodyMuted}>Why they matter: {donor.whyMatters}</p>}
          {given.length > 0 && <p className={TYPE.metadata}>{given.join(" · ")}</p>}
        </div>
      )}

      {ctx.receiptRequired && (
        <p className={TYPE.metadata}>
          Gifts of $250 and up need a written receipt with the tax language. Send it from{" "}
          <Link href="/admin/fundraising/today" className="underline underline-offset-2">
            Fundraising → Today
          </Link>{" "}
          if it hasn&apos;t gone out.
        </p>
      )}

      {canDraft && (
        <AckDraft
          giftId={ctx.giftId}
          major={rec.major}
          email={donor.email}
          onUsedEmail={() => {
            setChannel("email");
            setCloseIds(new Set());
          }}
        />
      )}

      <Field
        label="How did you thank them?"
        htmlFor="ack-channel"
        hint={`Recommended: ${rec.channelLabel} (${rec.basis}${rec.ruleName ? `: ${rec.ruleName}` : ""}).`}
      >
        <Select id="ack-channel" value={channel} onChange={(e) => {
          const next = e.target.value;
          setChannel(next);
          setCloseIds(new Set(PERSONAL.has(next) ? escalations.map((t) => t.id) : []));
        }}>
          {ACK_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c === "email" ? "Email (I sent it myself)" : CHANNEL_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>

      {(escalations.length > 0 || ackTasks.length > 0) && (
        <div className="space-y-2">
          <p className={TYPE.fieldLabel}>Also on your list</p>
          {escalations.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={closeIds.has(t.id)}
                onChange={(e) =>
                  setCloseIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    return next;
                  })
                }
              />
              <span>
                Close &ldquo;{t.title}&rdquo;{t.due_date ? `, due ${t.due_date}` : ""}, too
              </span>
            </label>
          ))}
          {ackTasks.map((t) => (
            <p key={t.id} className={TYPE.bodyMuted}>
              &ldquo;{t.title}&rdquo; closes with the thank-you.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
