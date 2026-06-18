"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BookingOption = {
  id: string;
  attendeeName: string;
  startTime: string;
  typeName: string;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Mark booked" on a connection — Phase 5 close-the-loop. Booked is a status
 * outcome (the task goes to done); optionally link the /meet booking that
 * fulfilled it, which also drops a meeting onto the constituent's timeline.
 * Lists confirmed bookings matched to the person by email; "no booking" still
 * just marks it done.
 */
export default function MarkBooked({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/meet/connections/${taskId}/bookings`);
      const d = await r.json().catch(() => ({}));
      setBookings(Array.isArray(d.bookings) ? d.bookings : []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  async function book(bookingId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/meet/connections/${taskId}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark booked");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        disabled={busy}
        className="text-[11px] font-semibold text-revenue hover:text-revenue/80 px-2 py-1 rounded-full border border-revenue/30 bg-revenue-bg disabled:opacity-50 transition-colors"
      >
        {busy ? "…" : "Mark booked"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-30 w-72 rounded-lg border-[1.5px] border-outline bg-tile shadow-xl py-1 text-xs"
          onMouseLeave={() => !busy && setOpen(false)}
        >
          {loading ? (
            <p className="px-3 py-2 text-ink-3">Finding bookings…</p>
          ) : (
            <>
              {bookings.length > 0 && (
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-3">
                  Link a /meet booking
                </div>
              )}
              {bookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => book(b.id)}
                  disabled={busy}
                  className="block w-full text-left px-3 py-1.5 hover:bg-[#EFE6D4] text-ink-1"
                >
                  <span className="font-medium">{b.typeName}</span> · {fmt(b.startTime)}
                  <span className="block text-ink-3">{b.attendeeName}</span>
                </button>
              ))}
              {bookings.length > 0 && <div className="border-t border-outline my-1" />}
              <button
                type="button"
                onClick={() => book(null)}
                disabled={busy}
                className="block w-full text-left px-3 py-1.5 hover:bg-[#EFE6D4] text-ink-2"
              >
                Just mark booked (no /meet link)
              </button>
            </>
          )}
          {error && <p className="px-3 py-1.5 text-expense">{error}</p>}
        </div>
      )}
    </div>
  );
}
