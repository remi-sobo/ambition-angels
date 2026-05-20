"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import type { Booking, MeetingType } from "@/lib/database.types";
import { MEET_ICON_MAP, type MeetIconName } from "../../icons";

type Mode = "idle" | "reschedule" | "cancel" | "done-rescheduled" | "done-cancelled";

type Slot = { start: string; end: string };

export default function ManageBooking({
  booking,
  meetingType,
  token,
}: {
  booking: Booking;
  meetingType: MeetingType;
  token: string;
}) {
  const initialMode: Mode =
    booking.status === "cancelled" ? "done-cancelled" : "idle";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [current, setCurrent] = useState<Booking>(booking);

  const accent = meetingType.color ?? "#E8500A";
  const Icon =
    meetingType.icon_name && meetingType.icon_name in MEET_ICON_MAP
      ? MEET_ICON_MAP[meetingType.icon_name as MeetIconName]
      : MEET_ICON_MAP.Sparkles;

  const attendeeTz = current.attendee_timezone;

  return (
    <>
      <section className="bg-cream pt-12 pb-8 lg:pt-16">
        <div className="container-site">
          <Link
            href="/meet"
            className="inline-flex items-center gap-1.5 text-sm text-gray-warm hover:text-ink transition-colors mb-8"
          >
            ← All conversations
          </Link>
          <div className="flex items-start gap-5 max-w-3xl">
            <span
              className="hidden sm:inline-flex items-center justify-center w-14 h-14 rounded-2xl shrink-0"
              style={{ backgroundColor: `${accent}1A`, color: accent }}
            >
              <Icon size={26} strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-warm mb-3">
                Your booking
              </div>
              <h1 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-[1.1]">
                {modeTitle(mode)}
              </h1>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#F5F4F0] section-pad">
        <div className="container-site max-w-3xl">
          <BookingSummary
            booking={current}
            meetingType={meetingType}
            attendeeTz={attendeeTz}
          />

          {mode === "idle" && (
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setMode("reschedule")}
                className="bg-orange hover:bg-orange-dark text-white font-semibold px-7 py-3.5 rounded-full transition-colors min-h-[48px]"
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={() => setMode("cancel")}
                className="bg-transparent hover:bg-white text-ink border border-gray-mid font-semibold px-7 py-3.5 rounded-full transition-colors min-h-[48px]"
              >
                Cancel this booking
              </button>
            </div>
          )}

          {mode === "reschedule" && (
            <ReschedulePanel
              token={token}
              meetingType={meetingType}
              attendeeTz={attendeeTz}
              onBack={() => setMode("idle")}
              onDone={(updated) => {
                setCurrent(updated);
                setMode("done-rescheduled");
              }}
            />
          )}

          {mode === "cancel" && (
            <CancelPanel
              token={token}
              onBack={() => setMode("idle")}
              onDone={() => setMode("done-cancelled")}
            />
          )}

          {mode === "done-rescheduled" && (
            <div className="mt-8">
              <p className="text-ink text-lg mb-2">
                New time, locked in. Calendar invite updated.
              </p>
              <p className="text-gray-warm">— Remi</p>
            </div>
          )}

          {mode === "done-cancelled" && (
            <div className="mt-8">
              <p className="text-ink text-lg mb-2">
                Got it. The hold is off the calendar.
              </p>
              <p className="text-gray-warm mb-8">— Remi</p>
              <Link
                href="/meet"
                className="inline-block bg-ink hover:bg-charcoal text-white font-semibold px-7 py-3.5 rounded-full transition-colors"
              >
                Rebook when you&rsquo;re ready
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function modeTitle(mode: Mode): string {
  switch (mode) {
    case "reschedule":
      return "Pick a new time.";
    case "cancel":
      return "Cancel this booking?";
    case "done-rescheduled":
      return "Rescheduled.";
    case "done-cancelled":
      return "Cancelled.";
    default:
      return "Your booking with Remi.";
  }
}

function BookingSummary({
  booking,
  meetingType,
  attendeeTz,
}: {
  booking: Booking;
  meetingType: MeetingType;
  attendeeTz: string;
}) {
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  return (
    <div className="bg-white border border-gray-light rounded-card p-6">
      <div className="font-heading font-bold text-xl text-ink mb-2">
        {meetingType.name} · {meetingType.duration_minutes} min
      </div>
      <div className="text-gray-warm">{formatLongDate(start, attendeeTz)}</div>
      <div className="text-gray-warm">
        {formatTime(start, attendeeTz)} – {formatTime(end, attendeeTz)}{" "}
        {tzShort(attendeeTz)}
      </div>
      {booking.google_meet_url ? (
        <a
          href={booking.google_meet_url}
          className="inline-flex items-center mt-4 text-sm font-semibold text-ink underline underline-offset-4 hover:text-orange transition-colors"
        >
          Meet link →
        </a>
      ) : null}
    </div>
  );
}

// ── Reschedule panel ─────────────────────────────────────────────

function ReschedulePanel({
  token,
  meetingType,
  attendeeTz,
  onBack,
  onDone,
}: {
  token: string;
  meetingType: MeetingType;
  attendeeTz: string;
  onBack: () => void;
  onDone: (updated: Booking) => void;
}) {
  const [step, setStep] = useState<"date" | "time">("date");
  const [date, setDate] = useState<Date | undefined>();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setSlots([]);
    fetch(
      `/api/meet/availability?slug=${encodeURIComponent(meetingType.slug)}&date=${formatYmd(date)}&tz=${encodeURIComponent(attendeeTz)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSlots(d.slots ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, meetingType.slug, attendeeTz]);

  const today = useMemo(() => startOfDayLocal(new Date()), []);
  const maxDate = useMemo(
    () => addDays(today, meetingType.max_advance_days),
    [today, meetingType.max_advance_days]
  );
  const disabledDays = [
    { before: today },
    { after: maxDate },
    (d: Date) => !meetingType.available_days.includes(jsDayToIso(d.getDay())),
  ];

  async function chooseSlot(slot: Slot) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meet/booking/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStartTime: slot.start }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not reschedule. Try again.");
        return;
      }
      // Re-fetch the updated booking so the summary refreshes.
      const refreshed = await fetch(`/api/meet/booking/${token}`).then((r) =>
        r.json()
      );
      onDone(refreshed.booking as Booking);
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-warm">
          {step === "date" ? "Step 1 of 2" : "Step 2 of 2"}
        </span>
        <button
          type="button"
          onClick={step === "time" ? () => setStep("date") : onBack}
          className="text-sm text-gray-warm hover:text-ink transition-colors"
        >
          ← {step === "time" ? "Different day" : "Keep current"}
        </button>
      </div>

      {step === "date" && (
        <DayPicker
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (!d) return;
            setDate(d);
            setStep("time");
          }}
          disabled={disabledDays}
          showOutsideDays={false}
        />
      )}

      {step === "time" && date && (
        <div>
          <h3 className="font-heading font-bold text-2xl text-ink mb-4">
            {formatLongDate(date, attendeeTz)}
          </h3>
          {loading ? (
            <p className="text-gray-warm">Loading times…</p>
          ) : slots.length === 0 ? (
            <p className="text-gray-warm">
              No availability that day. Try another date.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  disabled={submitting}
                  onClick={() => chooseSlot(s)}
                  className="bg-white border border-gray-light hover:border-ink text-ink font-semibold px-4 py-3.5 rounded-xl transition-all hover:-translate-y-0.5 min-h-[48px] disabled:opacity-60"
                >
                  {formatTime(new Date(s.start), attendeeTz)}
                </button>
              ))}
            </div>
          )}
          {!loading && slots.length > 0 ? (
            <p className="text-xs text-gray-warm mt-4">
              All times in {tzShort(attendeeTz)}.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-orange-dark mt-4">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Cancel panel ─────────────────────────────────────────────────

function CancelPanel({
  token,
  onBack,
  onDone,
}: {
  token: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meet/booking/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not cancel. Try again.");
        return;
      }
      onDone();
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8">
      <label className="block">
        <span className="block text-sm font-semibold text-ink mb-2">
          Anything you want me to know? (optional)
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full bg-white border border-gray-light rounded-card px-4 py-3 text-ink"
          placeholder="A line or two is plenty."
        />
      </label>

      {error ? <p className="text-sm text-orange-dark mt-3">{error}</p> : null}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="bg-ink hover:bg-charcoal text-white font-semibold px-7 py-3.5 rounded-full transition-colors min-h-[48px] disabled:opacity-60"
        >
          {submitting ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-gray-warm hover:text-ink transition-colors px-4 py-3.5 min-h-[48px]"
        >
          Keep it on the calendar
        </button>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────

function startOfDayLocal(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function jsDayToIso(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLongDate(d: Date, tz: string): string {
  return d.toLocaleDateString(undefined, {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(d: Date, tz: string): string {
  return d.toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

function tzShort(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}
