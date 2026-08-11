"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const inputClass =
  "w-full border border-gray-mid rounded-card px-4 py-3.5 text-ink bg-white text-sm focus:outline-none focus:border-orange transition-colors min-h-[48px]";
const labelClass =
  "block text-xs font-semibold text-charcoal uppercase tracking-widest mb-2";

const SETTINGS = [
  "High school (advisory / homeroom)",
  "Community college",
  "After-school program",
  "Mentoring program",
  "Juvenile justice program",
  "Faith community",
  "Individual mentor or parent",
  "Other",
];

const STUDENT_COUNTS = ["1–5", "Under 25", "25–100", "100–500", "500+"];

export default function SchoolsInquiryForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    organization: "",
    student_count: "",
    setting: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.role || !form.organization || !form.setting) {
      setError("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/schools-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("schools_inquiry_submitted", { setting: form.setting });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-card p-6">
        <svg
          className="w-6 h-6 text-green-600 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-heading font-semibold text-green-800">
          Got it. We&apos;ll reach out personally to walk you through what it takes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="schools-name" className={labelClass}>
            Name <span className="text-orange">*</span>
          </label>
          <input
            id="schools-name"
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            placeholder="Your name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="schools-email" className={labelClass}>
            Email <span className="text-orange">*</span>
          </label>
          <input
            id="schools-email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            placeholder="you@yourschool.org"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="schools-role" className={labelClass}>
            Role <span className="text-orange">*</span>
          </label>
          <input
            id="schools-role"
            type="text"
            name="role"
            value={form.role}
            onChange={handleChange}
            required
            placeholder="Principal, counselor, program director…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="schools-org" className={labelClass}>
            Organization <span className="text-orange">*</span>
          </label>
          <input
            id="schools-org"
            type="text"
            name="organization"
            value={form.organization}
            onChange={handleChange}
            required
            placeholder="School or program name"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="schools-count" className={labelClass}>
            Number of students
          </label>
          <div className="relative">
            <select
              id="schools-count"
              name="student_count"
              value={form.student_count}
              onChange={handleChange}
              className={`${inputClass} appearance-none pr-10`}
            >
              <option value="">Select…</option>
              {STUDENT_COUNTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 text-gray-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="schools-setting" className={labelClass}>
            Setting <span className="text-orange">*</span>
          </label>
          <div className="relative">
            <select
              id="schools-setting"
              name="setting"
              value={form.setting}
              onChange={handleChange}
              required
              className={`${inputClass} appearance-none pr-10`}
            >
              <option value="">Select your setting…</option>
              {SETTINGS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg className="w-4 h-4 text-gray-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[56px] disabled:opacity-60 flex items-center justify-center"
      >
        {submitting ? "Sending…" : "Start the conversation"}
      </button>

      <p className="text-center text-xs text-gray-warm">
        We&apos;ll reach out personally, usually the same day.
      </p>
    </form>
  );
}
