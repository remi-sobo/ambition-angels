"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export type OpenCohort = { id: string; name: string };

const GRADES = ["6th", "7th", "8th", "9th", "10th", "11th", "12th"];

export default function ApplyForm({ cohorts }: { cohorts: OpenCohort[] }) {
  const [form, setForm] = useState({
    cohort_id: "",
    first_name: "",
    last_name: "",
    grade: "",
    school: "",
    email: "",
    guardian_name: "",
    guardian_email: "",
    guardian_phone: "",
    motivation: "",
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
    if (!form.first_name || !form.last_name || !form.grade || !form.guardian_name || !form.guardian_email) {
      setFormError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("student_application_submitted", { cohort_id: form.cohort_id || "general" });
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
          Application received.
        </p>
        <p className="text-gray-mid text-sm leading-relaxed">
          We review every application and will follow up at the parent/guardian email with next
          steps. Questions? Email{" "}
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
  const req = <span className="text-orange">*</span>;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {cohorts.length > 0 && (
        <div>
          <label className={labelClass}>Program</label>
          <div className="relative">
            <select name="cohort_id" value={form.cohort_id} onChange={handleChange} className={selectClass}>
              <option value="">General interest — match me to a program</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-mid text-xs">▾</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Student First Name {req}</label>
          <input type="text" name="first_name" value={form.first_name} onChange={handleChange} required placeholder="First name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Student Last Name {req}</label>
          <input type="text" name="last_name" value={form.last_name} onChange={handleChange} required placeholder="Last name" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Grade {req}</label>
          <div className="relative">
            <select name="grade" value={form.grade} onChange={handleChange} required className={selectClass}>
              <option value="">Select grade…</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-mid text-xs">▾</div>
          </div>
        </div>
        <div>
          <label className={labelClass}>School</label>
          <input type="text" name="school" value={form.school} onChange={handleChange} placeholder="School name" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Student Email <span className="normal-case tracking-normal font-normal">(optional)</span></label>
        <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="student@email.com" className={inputClass} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Parent / Guardian Name {req}</label>
          <input type="text" name="guardian_name" value={form.guardian_name} onChange={handleChange} required placeholder="Full name" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Parent / Guardian Phone</label>
          <input type="tel" name="guardian_phone" value={form.guardian_phone} onChange={handleChange} placeholder="(650) 555-0100" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Parent / Guardian Email {req}</label>
        <input type="email" name="guardian_email" value={form.guardian_email} onChange={handleChange} required placeholder="parent@email.com" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Why do you want to join?</label>
        <textarea name="motivation" value={form.motivation} onChange={handleChange} rows={4} placeholder="A sentence or two is perfect — what are you excited about?" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>How did you hear about us?</label>
        <input type="text" name="referral" value={form.referral} onChange={handleChange} placeholder="School, a friend, Instagram…" className={inputClass} />
      </div>

      {formError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-card px-4 py-3">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-orange-dark text-white font-heading font-bold text-sm uppercase tracking-widest rounded-full px-8 py-4 transition-colors disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit Application"}
      </button>
      <p className="text-[11px] text-gray-mid text-center leading-relaxed">
        We&apos;ll only use this information to review the application and contact you about the
        program.
      </p>
    </form>
  );
}
