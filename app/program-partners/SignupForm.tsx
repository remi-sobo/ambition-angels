"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const programTypes = [
  "After-School Program",
  "Athletic Program",
  "Faith Community",
  "Juvenile Justice",
  "Foster Care",
  "Mentorship Program",
  "School",
  "Other",
];

const teenCounts = ["Under 10", "10–25", "26–50", "51–100", "100+"];

export default function ProgramPartnerSignupForm() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    org_name: "",
    email: "",
    program_type: "",
    teen_count: "",
    referral: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.first_name || !form.last_name || !form.org_name || !form.email || !form.program_type) {
      setFormError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/program-partner-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("program_partner_submitted", { program_type: form.program_type });
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-cream/10 border border-cream/20 rounded-card-lg px-8 py-8 text-center">
        <div className="font-display font-black text-4xl text-orange mb-3">✓</div>
        <p className="font-heading font-bold text-cream text-xl mb-2">
          You&apos;re in. Check your email.
        </p>
        <p className="text-gray-mid text-sm leading-relaxed">
          Your program code is on the way — usually within a few hours. If you don&apos;t hear from us by tomorrow, email{" "}
          <a href="mailto:hello@ambitionangels.org" className="text-orange underline underline-offset-2">
            hello@ambitionangels.org
          </a>.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full border border-white/15 rounded-card bg-white/5 px-4 py-3.5 text-cream text-sm placeholder:text-gray-mid focus:outline-none focus:border-orange/60 transition-colors min-h-[48px]";
  const selectClass = inputClass + " appearance-none";
  const labelClass = "block text-xs font-semibold text-gray-mid uppercase tracking-widest mb-2";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>First Name <span className="text-orange">*</span></label>
          <input type="text" name="first_name" value={form.first_name} onChange={handleChange} required placeholder="First name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last Name <span className="text-orange">*</span></label>
          <input type="text" name="last_name" value={form.last_name} onChange={handleChange} required placeholder="Last name" className={inputClass} />
        </div>
      </div>

      {/* Org */}
      <div>
        <label className={labelClass}>Organization Name <span className="text-orange">*</span></label>
        <input type="text" name="org_name" value={form.org_name} onChange={handleChange} required placeholder="e.g. Hidden Genius Project" className={inputClass} />
      </div>

      {/* Email */}
      <div>
        <label className={labelClass}>Email Address <span className="text-orange">*</span></label>
        <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@yourorg.org" className={inputClass} />
      </div>

      {/* Program type */}
      <div>
        <label className={labelClass}>Program Type <span className="text-orange">*</span></label>
        <div className="relative">
          <select name="program_type" value={form.program_type} onChange={handleChange} required className={selectClass}>
            <option value="">Select your program type…</option>
            {programTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-gray-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Teen count */}
      <div>
        <label className={labelClass}>Approximate number of teens in your program</label>
        <div className="relative">
          <select name="teen_count" value={form.teen_count} onChange={handleChange} className={selectClass}>
            <option value="">Select…</option>
            {teenCounts.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-gray-mid" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Referral */}
      <div>
        <label className={labelClass}>How did you hear about us? <span className="text-gray-mid/50 normal-case tracking-normal font-normal">(optional)</span></label>
        <input type="text" name="referral" value={form.referral} onChange={handleChange} placeholder="Social media, referral, event…" className={inputClass} />
      </div>

      {formError && <p className="text-red-400 text-sm">{formError}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-5 rounded-full transition-colors min-h-[60px] disabled:opacity-60 flex items-center justify-center"
      >
        {submitting ? "Submitting…" : "Get Access — It's Free"}
      </button>

      <p className="text-center text-xs text-gray-mid leading-relaxed">
        We&apos;ll send your program code and guide dashboard login within 24 hours. Usually same day.
      </p>
    </form>
  );
}
