"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Lightweight MESA student signup. Two fields, one button. Posts through the
 * existing /api/partner-waitlist path (tagged role "MESA Student") so the team
 * can track who started. No new backend.
 */
export default function StudentSignup() {
  const [form, setForm] = useState({ first_name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.first_name || !form.email) {
      setFormError("Add your first name and email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "MESA Student" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("mesa_student_signup", {});
      setSubmitted(true);
      setForm({ first_name: "", email: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-3 bg-white/5 border border-white/15 rounded-card p-5">
        <svg
          className="w-6 h-6 text-orange flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-heading font-semibold text-cream">
          You&apos;re in. Now grab the app above and start.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="mesa-first-name" className="sr-only">
        First name
      </label>
      <input
        id="mesa-first-name"
        type="text"
        name="first_name"
        value={form.first_name}
        onChange={handleChange}
        required
        autoComplete="given-name"
        placeholder="First name"
        className="w-full border border-white/20 rounded-card px-4 py-3.5 text-cream bg-white/5 text-base placeholder:text-gray-mid/70 focus:outline-none focus:border-orange transition-colors min-h-[52px]"
      />
      <label htmlFor="mesa-email" className="sr-only">
        Email
      </label>
      <input
        id="mesa-email"
        type="email"
        name="email"
        value={form.email}
        onChange={handleChange}
        required
        autoComplete="email"
        placeholder="Email"
        className="w-full border border-white/20 rounded-card px-4 py-3.5 text-cream bg-white/5 text-base placeholder:text-gray-mid/70 focus:outline-none focus:border-orange transition-colors min-h-[52px]"
      />
      {formError && <p className="text-sm text-orange-mid font-medium">{formError}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-orange-dark text-white font-semibold text-base px-8 py-4 rounded-full transition-colors min-h-[56px] disabled:opacity-60 flex items-center justify-center"
      >
        {submitting ? "Submitting…" : "I'm a MESA student"}
      </button>
      <p className="text-center text-xs text-gray-mid/70">
        Just so your MESA team knows you started. No spam.
      </p>
    </form>
  );
}
