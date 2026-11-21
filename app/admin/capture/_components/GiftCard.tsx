"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "../../_components/ui/Button";
import GiftDrawer from "../../fundraising/_components/gift/GiftDrawer";
import { TYPE } from "@/lib/admin/typeScale";
import { entityName, giftAmountText, giftLine, isUncertain, type CardView } from "../_lib/cardView";
import { giftRecorded, pledgeAdded } from "../_lib/captureApi";

/**
 * The gift or pledge card (V4 §8, CapturePhone.dc.html). Capture never records
 * money: "Open gift form" opens the existing gift drawer (V4 B1) prefilled with
 * the donor, amount and date heard. The drawer's own button saves the gift
 * through the gift route and waits for the server (money is never shown before it saves); only
 * then is this card marked filed with the new gift's id.
 *
 * A pledge cannot go through the gift drawer (it records received money), so
 * the card links to the donor's record to add it there, then "I added it".
 */
export default function GiftCardBody({
  card,
  busy,
  onReplace,
  onError,
}: {
  card: CardView;
  busy: boolean;
  onReplace: (card: CardView) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const amount = giftAmountText(card);
  const heard = typeof card.payload.amount_heard === "string" ? card.payload.amount_heard : null;
  const pledge = card.payload.gift_type === "pledge";
  const name = entityName(card);
  const held = card.status === "held";

  const onSaved = async (giftId: string) => {
    setLinking(true);
    const r = await giftRecorded(card.id, giftId);
    setLinking(false);
    if (r.ok) onReplace(r.data.card);
    else onError(`The gift is saved, but this card could not be marked done: ${r.error}`);
  };

  const markPledge = async () => {
    setLinking(true);
    const r = await pledgeAdded(card.id);
    setLinking(false);
    if (r.ok) onReplace(r.data.card);
    else onError(r.error);
  };

  return (
    <>
      <p className={`${TYPE.body} mt-2`}>{giftLine(card)}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`${TYPE.cardTitle} tabular-nums`}>{amount ?? "No amount heard"}</span>
        {isUncertain(card, "amount") && (
          <span className="text-sm font-semibold text-status-watch-text">
            Check this{heard ? ` · heard “${heard}”` : ""}
          </span>
        )}
      </div>
      {isUncertain(card, "who") && (
        <p className="mt-1 text-sm font-semibold text-status-watch-text">Check the donor{card.heard_name ? ` · heard “${card.heard_name}”` : ""}</p>
      )}
      {isUncertain(card, "date") && <p className="mt-1 text-sm font-semibold text-status-watch-text">Check the date</p>}

      {held && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pledge ? (
            <>
              {card.entity_id ? (
                <Link
                  href={`/admin/fundraising/donors-funders/${card.entity_id}`}
                  className={`${TYPE.button} inline-flex min-h-[44px] items-center rounded-control bg-orange px-4 text-white hover:bg-orange-dark`}
                >
                  Add pledge on {name ?? "the record"}
                </Link>
              ) : (
                <Link
                  href="/admin/fundraising/donors-funders"
                  className={`${TYPE.button} inline-flex min-h-[44px] items-center rounded-control bg-orange px-4 text-white hover:bg-orange-dark`}
                >
                  Find the donor
                </Link>
              )}
              <Button type="button" variant="secondary" size="lg" disabled={busy || linking} onClick={() => void markPledge()}>
                {linking ? "Saving" : "I added it"}
              </Button>
            </>
          ) : (
            <Button type="button" size="lg" disabled={busy || linking} onClick={() => setOpen(true)}>
              {linking ? "Saving" : "Open gift form"}
            </Button>
          )}
        </div>
      )}

      {!pledge && (
        <GiftDrawer
          open={open}
          onClose={() => setOpen(false)}
          constituentId={card.entity_id ?? undefined}
          prefill={{
            amount: typeof card.payload.amount === "number" ? card.payload.amount : null,
            date: typeof card.payload.gift_date === "string" ? card.payload.gift_date : null,
            notes: typeof card.payload.notes === "string" ? card.payload.notes : null,
            note: isUncertain(card, "amount")
              ? `Check the amount${heard ? `: I heard “${heard}”` : ""}. Nothing is saved until you press the button below.`
              : "Nothing is saved until you press the button below.",
          }}
          onSaved={(id) => void onSaved(id)}
        />
      )}
    </>
  );
}
