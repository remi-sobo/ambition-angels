"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const fields = [
  "Software engineering",
  "Hardware and computer engineering",
  "Cybersecurity",
  "Data and AI",
  "Product and project management",
  "Finance and banking",
  "Investing and wealth management",
  "Accounting",
  "Marketing and social media",
  "Sales and business development",
  "Entrepreneurship",
  "Design (UX, graphic, product)",
  "Healthcare and nursing",
  "Law",
  "Education",
  "Media and entertainment",
  "Trades and construction",
  "Other",
];

const timings = ["Ready now", "Starting in January", "Later in 2027", "Just exploring"];

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  field: string;
  linkedin: string;
  timing: string;
  referral: string;
  note: string;
  website: string;
};

const empty: Form = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  role: "",
  field: "",
  linkedin: "",
  timing: "",
  referral: "",
  note: "",
  website: "",
};

export default function CoachSignupForm() {
  const [form, setForm] = useState<Form>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.first_name || !form.last_name || !form.email || !form.role || !form.field) {
      setFormError("Please add your name, email, role and field.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/coach-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("coach_signup_submitted", { field: form.field });
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-cream/10 border border-cream/20 rounded-card-lg px-8 py-10 text-center" role="status">
        <p className="font-heading font-bold text-cream text-2xl mb-3">Thanks, {form.first_name}.</p>
        <p className="text-gray-mid text-base leading-relaxed max-w-md mx-auto">
          Remi will reach out for a short call. Nothing is set until you see a student&apos;s profile and say yes.
          Check your inbox for a confirmation.
        </p>
      </div>
    );
  }

  const input =
    "w-full border border-white/15 rounded-card bg-white/5 px-4 py-3.5 text-cream text-sm placeholder:text-gray-mid/70 focus:outline-none focus:border-orange/70 focus-visible:ring-2 focus-visible:ring-orange/40 transition-colors min-h-[48px]";
  const label = "block text-xs font-semibold text-gray-mid uppercase tracking-widest mb-2";
  const req = <span className="text-orange">*</span>;
  const opt = <span className="text-gray-mid/60 normal-case tracking-normal font-normal">(optional)</span>;
  const chevron = (
    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
      <svg className="w-4 h-4 text-gray-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="c-first" className={label}>First name {req}</label>
          <input id="c-first" name="first_name" value={form.first_name} onChange={set} autoComplete="given-name" className={input} />
        </div>
        <div>
          <label htmlFor="c-last" className={label}>Last name {req}</label>
          <input id="c-last" name="last_name" value={form.last_name} onChange={set} autoComplete="family-name" className={input} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="c-email" className={label}>Email {req}</label>
          <input id="c-email" type="email" name="email" value={form.email} onChange={set} autoComplete="email" className={input} />
        </div>
        <div>
          <label htmlFor="c-phone" className={label}>Phone {opt}</label>
          <input id="c-phone" type="tel" name="phone" value={form.phone} onChange={set} autoComplete="tel" className={input} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="c-role" className={label}>Your role {req}</label>
          <input id="c-role" name="role" value={form.role} onChange={set} placeholder="e.g. Security analyst" autoComplete="organization-title" className={input} />
        </div>
        <div>
          <label htmlFor="c-company" className={label}>Company {opt}</label>
          <input id="c-company" name="company" value={form.company} onChange={set} autoComplete="organization" className={input} />
        </div>
      </div>

      <div>
        <label htmlFor="c-field" className={label}>The field you&apos;d coach in {req}</label>
        <div className="relative">
          <select id="c-field" name="field" value={form.field} onChange={set} className={input + " appearance-none"}>
            <option value="">Pick the closest one</option>
            {fields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {chevron}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="c-linkedin" className={label}>LinkedIn {opt}</label>
          <input id="c-linkedin" name="linkedin" value={form.linkedin} onChange={set} placeholder="linkedin.com/in/…" className={input} />
        </div>
        <div>
          <label htmlFor="c-timing" className={label}>When could you start? {opt}</label>
          <div className="relative">
            <select id="c-timing" name="timing" value={form.timing} onChange={set} className={input + " appearance-none"}>
              <option value="">Select</option>
              {timings.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {chevron}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="c-ref" className={label}>How did you hear about this? {opt}</label>
        <input id="c-ref" name="referral" value={form.referral} onChange={set} placeholder="Remi's email, a friend, LinkedIn…" className={input} />
      </div>

      <div>
        <label htmlFor="c-note" className={label}>Anything we should know? {opt}</label>
        <textarea id="c-note" name="note" value={form.note} onChange={set} rows={3} className={input + " min-h-[96px]"} />
      </div>

      {/* Honeypot, hidden from people */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" value={form.website} onChange={set} tabIndex={-1} autoComplete="off" />
      </div>

      {formError && (
        <p className="text-orange-mid text-sm" role="alert">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-orange-dark text-white font-heading font-semibold text-base px-8 py-5 rounded-full transition-colors min-h-[60px] disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Sign up to coach"}
      </button>

      <p className="text-center text-xs text-gray-mid leading-relaxed">
        Signing up is not a commitment. Remi reaches out first, and you see a student&apos;s profile before anything
        is set.
      </p>
    </form>
  );
}
