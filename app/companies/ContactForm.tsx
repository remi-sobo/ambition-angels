"use client";

import { useState } from "react";

export default function CompaniesContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim() || !email.trim()) {
      setFormError("Please fill in your name and email.");
      return;
    }
    setSubmitting(true);
    // Split name into first / last (gracefully handles single-word names)
    const parts = name.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.slice(1).join(" ") || "—";
    try {
      const res = await fetch("/api/partner-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name,
          last_name,
          email: email.trim(),
          role: "Corporate Partner",
          teen_count: "",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white/20 border border-white/30 rounded-card-lg px-8 py-6 text-center max-w-lg mx-auto">
        <p className="font-heading font-bold text-white text-lg">
          You&apos;re on Remi&apos;s list. He&apos;ll reach out directly.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          className="w-full px-5 py-4 rounded-full text-ink text-sm font-medium bg-white border-2 border-transparent focus:outline-none focus:border-white/40 min-h-[52px] placeholder:text-gray-mid"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@company.com"
            required
            className="flex-1 px-5 py-4 rounded-full text-ink text-sm font-medium bg-white border-2 border-transparent focus:outline-none focus:border-white/40 min-h-[52px] placeholder:text-gray-mid"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-white text-orange hover:bg-orange-light font-semibold text-sm px-8 py-4 rounded-full transition-colors min-h-[52px] disabled:opacity-60 whitespace-nowrap"
          >
            {submitting ? "Sending…" : "Get in Touch"}
          </button>
        </div>
      </form>
      {formError && (
        <p className="text-white/80 text-sm mt-3 text-center">{formError}</p>
      )}
    </div>
  );
}
