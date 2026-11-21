"use client";

import { useState } from "react";
import Button, { type ButtonSize, type ButtonVariant } from "@/app/admin/_components/ui/Button";
import GiftDrawer from "./GiftDrawer";

/**
 * The entry points to the gift drawer (V4 B1). Each owns its open state and
 * mounts the one GiftDrawer:
 *  - <RecordGiftButton constituentId?> : the page's primary "Record a gift"
 *    (donor record, Donors & Funders).
 *  - <EditGiftButton giftId> : "Edit" on a gift in the donor timeline.
 *  - <ReviewGiftButton giftId> : a thank-you row on Today / Thank-yous opens
 *    the same drawer on that gift, with its thank-you section.
 */
export function RecordGiftButton({
  constituentId,
  label = "Record a gift",
  variant = "primary",
  size = "lg",
}: {
  constituentId?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <GiftDrawer open={open} onClose={() => setOpen(false)} constituentId={constituentId} />
    </>
  );
}

export function EditGiftButton({ giftId, label = "Edit", amountLabel }: { giftId: string; label?: string; amountLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={amountLabel ? `${label} the ${amountLabel} gift` : undefined}
      >
        {label}
      </Button>
      <GiftDrawer open={open} onClose={() => setOpen(false)} giftId={giftId} />
    </>
  );
}

export function ReviewGiftButton({ giftId, label = "Review gift", size = "sm" }: { giftId: string; label?: string; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="quiet" size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <GiftDrawer open={open} onClose={() => setOpen(false)} giftId={giftId} />
    </>
  );
}
