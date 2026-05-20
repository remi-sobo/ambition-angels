"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import "react-day-picker/style.css";

import type { MeetingType } from "@/lib/database.types";
import { MEET_ICON_MAP, type MeetIconName } from "../icons";

type Step = "type" | "date" | "time" | "details" | "booked";

type Slot = { start: string; end: string };

type BookingResult = {
  success: boolean;
  bookingId: string;
  cancelToken: string;
};

const ROLE_OPTIONS = [
  "CSR or Foundation",
  "Talent Acquisition",
  "Executive Sponsor",
  "Press",
  "Donor",
  "Advisor",
  "Other",
];

const formSchema = z.object({
  name: z.string().min(1, "Your name").max(200),
  email: z.string().email("A real email").max(320),
  company: z.string().max(200).optional(),
  role: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
});
type FormData = z.infer<typeof formSchema>;

export default function BookingFlow({ meetingType }: { meetingType: MeetingType }) {
  const [step, setStep] = useState<Step>("type");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<Slot | undefined>();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const attendeeTz = useMemo(
    () =>
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "America/Los_Angeles",
    []
  );

  const accent = meetingType.color ?? "#E8500A";
  const Icon =
    meetingType.icon_name && meetingType.icon_name in MEET_ICON_MAP
      ? MEET_ICON_MAP[meetingType.icon_name as MeetIconName]
      : MEET_ICON_MAP.Sparkles;

  // Fetch slots whenever a date is selected
  useEffect(() => {
    if (!selectedDate) return;
    const dateStr = formatYmd(selectedDate);
    const tz = attendeeTz;
    let cancelled = false;
    setSlotsLoading(true);
    setSlots([]);
    fetch(
      `/api/meet/availability?slug=${encodeURIComponent(meetingType.slug)}&date=${dateStr}&tz=${encodeURIComponent(tz)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate, attendeeTz, meetingType.slug]);

  // Smooth scroll on step changes (except initial)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${step}`);
      stepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [step]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", company: "", role: "", message: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selectedSlot) return;
    setSubmitError(null);
    try {
      const res = await fetch("/api/meet/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingTypeSlug: meetingType.slug,
          startTime: selectedSlot.start,
          attendeeTimezone: attendeeTz,
          attendee: {
            name: values.name,
            email: values.email,
            company: values.company || undefined,
            role: values.role || undefined,
            message: values.message || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setBookingResult(data as BookingResult);
      setStep("booked");
    } catch {
      setSubmitError("Network hiccup. Try again.");
    }
  });

  // Disable past, beyond max_advance, and non-available weekdays
  const today = startOfDayLocal(new Date());
  const maxDate = addDays(today, meetingType.max_advance_days);
  const disabledDays = [
    { before: today },
    { after: maxDate },
    (d: Date) => {
      const iso = jsDayToIso(d.getDay());
      return !meetingType.available_days.includes(iso);
    },
  ];

  return (
    <>
      {/* ── HEADER ──────────────────────────────────────────────────── */}
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
              <div
                className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
                style={{ backgroundColor: `${accent}1A`, color: accent }}
              >
                {meetingType.duration_minutes} minutes
              </div>
              <h1 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-[1.1] mb-3">
                {meetingType.name}
              </h1>
              {meetingType.description ? (
                <p className="text-gray-warm text-lg leading-relaxed mb-3">
                  {meetingType.description}
                </p>
              ) : null}
              {meetingType.who_its_for ? (
                <p className="text-sm text-gray-warm/80">
                  <span className="font-semibold uppercase tracking-widest text-gray-warm">
                    For
                  </span>{" "}
                  {meetingType.who_its_for}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── STEP AREA ───────────────────────────────────────────────── */}
      <section ref={stepRef} className="bg-[#F5F4F0] section-pad">
        <div className="container-site max-w-3xl">
          {step === "type" && (
            <StepShell step={1} title="Ready when you are.">
              {meetingType.prep_notes ? (
                <p className="text-gray-warm mb-6 leading-relaxed">
                  <span className="font-semibold text-ink">What to bring: </span>
                  {meetingType.prep_notes}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setStep("date")}
                className="bg-ink hover:bg-charcoal text-white font-semibold px-7 py-3.5 rounded-full transition-colors min-h-[48px]"
              >
                Pick a date →
              </button>
            </StepShell>
          )}

          {step === "date" && (
            <StepShell step={2} title="Pick a date.">
              <div className="meet-day-picker">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDate(d);
                    setSelectedSlot(undefined);
                    setStep("time");
                  }}
                  disabled={disabledDays}
                  showOutsideDays={false}
                  styles={{
                    day: { fontFamily: "var(--font-body)" },
                  }}
                  modifiersStyles={{
                    selected: { background: accent, color: "white" },
                  }}
                />
              </div>
            </StepShell>
          )}

          {step === "time" && (
            <StepShell
              step={3}
              title={
                selectedDate
                  ? `Times on ${formatLongDate(selectedDate)}.`
                  : "Pick a time."
              }
              onBack={() => setStep("date")}
              backLabel="Different day"
            >
              {slotsLoading ? (
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
                      onClick={() => {
                        setSelectedSlot(s);
                        setStep("details");
                      }}
                      className="bg-white border border-gray-light hover:border-ink text-ink font-semibold px-4 py-3.5 rounded-xl transition-all hover:-translate-y-0.5 min-h-[48px]"
                    >
                      {formatTime(new Date(s.start), attendeeTz)}
                    </button>
                  ))}
                </div>
              )}
              {!slotsLoading && slots.length > 0 ? (
                <p className="text-xs text-gray-warm mt-4">
                  All times in {tzShort(attendeeTz)}.
                </p>
              ) : null}
            </StepShell>
          )}

          {step === "details" && selectedSlot && (
            <StepShell
              step={4}
              title="Tell me a little."
              onBack={() => setStep("time")}
              backLabel="Different time"
            >
              <div className="bg-white border border-gray-light rounded-card p-4 mb-6 text-sm">
                <div className="font-semibold text-ink">
                  {formatLongDate(new Date(selectedSlot.start))} ·{" "}
                  {formatTime(new Date(selectedSlot.start), attendeeTz)}{" "}
                  <span className="text-gray-warm font-normal">
                    {tzShort(attendeeTz)}
                  </span>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <Field
                  label="Your name"
                  error={form.formState.errors.name?.message}
                >
                  <input
                    {...form.register("name")}
                    className="meet-input"
                    autoComplete="name"
                  />
                </Field>
                <Field
                  label="Email"
                  error={form.formState.errors.email?.message}
                >
                  <input
                    {...form.register("email")}
                    type="email"
                    className="meet-input"
                    autoComplete="email"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Company (optional)">
                    <input
                      {...form.register("company")}
                      className="meet-input"
                      autoComplete="organization"
                    />
                  </Field>
                  <Field label="What brings you here?">
                    <select {...form.register("role")} className="meet-input">
                      <option value="">Pick one</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Want me to know anything?">
                  <textarea
                    {...form.register("message")}
                    className="meet-input min-h-[120px]"
                    placeholder="One line about what you want to discuss is plenty."
                  />
                </Field>

                {submitError ? (
                  <p className="text-sm text-orange-dark">{submitError}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="bg-ink hover:bg-charcoal text-white font-semibold px-7 py-3.5 rounded-full transition-colors min-h-[48px] disabled:opacity-60"
                >
                  {form.formState.isSubmitting
                    ? "Booking…"
                    : "Book this conversation"}
                </button>
              </form>
            </StepShell>
          )}

          {step === "booked" && bookingResult && selectedSlot && (
            <Confirmation
              meetingType={meetingType}
              slot={selectedSlot}
              attendeeTz={attendeeTz}
              cancelToken={bookingResult.cancelToken}
            />
          )}
        </div>
      </section>

      <style jsx global>{`
        .meet-input {
          width: 100%;
          background: #ffffff;
          border: 1px solid #e7e5dc;
          border-radius: 14px;
          padding: 14px 16px;
          font-family: var(--font-body);
          font-size: 16px;
          color: #0e0e0e;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .meet-input:focus {
          outline: none;
          border-color: #0e0e0e;
          box-shadow: 0 0 0 3px rgba(14, 14, 14, 0.06);
        }
        .meet-day-picker {
          --rdp-accent-color: ${accent};
          --rdp-background-color: ${accent}1a;
          --rdp-cell-size: 44px;
        }
      `}</style>
    </>
  );
}

function StepShell({
  step,
  title,
  children,
  onBack,
  backLabel,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-warm">
          Step {step} of 4
        </span>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-warm hover:text-ink transition-colors"
          >
            ← {backLabel ?? "Back"}
          </button>
        ) : null}
      </div>
      <h2 className="font-heading font-bold text-3xl lg:text-4xl text-ink tracking-tight leading-tight mb-6">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink mb-2">{label}</span>
      {children}
      {error ? <span className="block text-sm text-orange-dark mt-1.5">{error}</span> : null}
    </label>
  );
}

function Confirmation({
  meetingType,
  slot,
  attendeeTz,
  cancelToken,
}: {
  meetingType: MeetingType;
  slot: Slot;
  attendeeTz: string;
  cancelToken: string;
}) {
  return (
    <div>
      <span className="text-xs font-bold uppercase tracking-widest text-orange mb-4 block">
        You&rsquo;re booked
      </span>
      <h2 className="font-heading font-bold text-4xl lg:text-5xl text-ink tracking-tight leading-[1.1] mb-6">
        You&rsquo;re booked.
      </h2>
      <div className="bg-white border border-gray-light rounded-card p-6 mb-6">
        <div className="font-heading font-bold text-xl text-ink mb-2">
          {meetingType.name} · {meetingType.duration_minutes} min
        </div>
        <div className="text-gray-warm">
          {formatLongDate(new Date(slot.start))}
        </div>
        <div className="text-gray-warm">
          {formatTime(new Date(slot.start), attendeeTz)} –{" "}
          {formatTime(new Date(slot.end), attendeeTz)} {tzShort(attendeeTz)}
        </div>
      </div>
      <p className="text-gray-warm mb-2">
        Calendar invite&apos;s on the way. Meet link is in the email.
      </p>
      <p className="text-gray-warm mb-8">
        Need to change something?{" "}
        <Link
          href={`/meet/booked/${cancelToken}`}
          className="text-ink underline underline-offset-4 hover:text-orange transition-colors"
        >
          Manage your booking
        </Link>
        .
      </p>
      <p className="text-ink text-lg">
        Or just close this tab. I&rsquo;ll see you then.
      </p>
      <p className="text-gray-warm mt-1">— Remi</p>
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

function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
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
