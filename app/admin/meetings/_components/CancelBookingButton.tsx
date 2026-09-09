"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { useConfirm } from "@/app/admin/_components/feedback/ConfirmProvider";
import { userMessage } from "@/lib/admin/errors";

// Inline cancel for a booking-page booking shown in the Upcoming list. Sits
// outside the row's link so cancelling never requires opening the meeting.
// The API emails the attendee and removes the calendar event; refresh flows
// the row out of Upcoming.
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (busy) return;
    const ok = await confirm({
      title: "Cancel this booking?",
      body: "The attendee will be emailed.",
      confirmLabel: "Cancel booking",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/meet/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "cancelled by admin" }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        toast.error(userMessage(r, data));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={cancel}
      className="shrink-0 text-[11px] font-medium text-ink-3 hover:text-expense transition-colors disabled:opacity-50"
    >
      {busy ? "Cancelling…" : "Cancel"}
    </button>
  );
}
