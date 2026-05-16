"use client";

import { useState } from "react";

const ROLE_OPTIONS = [
  "CSR or Foundation",
  "Talent Acquisition or Recruiting",
  "Executive Sponsor",
  "Communications or Marketing",
  "Other",
];

export default function CompaniesContactForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [roleCategory, setRoleCategory] = useState("");
  const [problem, setProblem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !company.trim() ||
      !email.trim() ||
      !roleCategory
    ) {
      setFormError("Please fill in the required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          role: "Corporate Partner",
          teen_count: "",
          company: company.trim(),
          role_category: roleCategory,
          problem_to_solve: problem.trim(),
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
      <div className="bg-white/20 border border-white/30 rounded-card-lg px-8 py-6 text-center max-w-xl mx-auto">
        <p className="font-heading font-bold text-white text-lg">
          You&apos;re on Remi&apos;s list. He&apos;ll reach out directly.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full px-5 py-4 rounded-full text-ink text-sm font-medium bg-white border-2 border-transparent focus:outline-none focus:border-white/40 min-h-[52px] placeholder:text-gray-mid";

  return (
    <div className="max-w-xl mx-auto text-left">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
            autoComplete="given-name"
            className={inputClass}
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
            autoComplete="family-name"
            className={inputClass}
          />
        </div>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          required
          autoComplete="organization"
          className={inputClass}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@company.com"
          required
          autoComplete="email"
          className={inputClass}
        />
        <select
          value={roleCategory}
          onChange={(e) => setRoleCategory(e.target.value)}
          required
          className={`${inputClass} appearance-none bg-white pr-10`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none' stroke='%236B6960' stroke-width='2'><path d='M2 4l4 4 4-4' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 1.25rem center",
          }}
        >
          <option value="" disabled>
            What best matches your role?
          </option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="What's the problem you're hoping to solve? (optional)"
          rows={4}
          className="w-full px-5 py-4 rounded-card text-ink text-sm font-medium bg-white border-2 border-transparent focus:outline-none focus:border-white/40 placeholder:text-gray-mid leading-relaxed resize-y"
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-white text-orange hover:bg-orange-light font-semibold text-sm px-8 py-4 rounded-full transition-colors min-h-[52px] disabled:opacity-60 mt-2"
        >
          {submitting ? "Sending…" : "Start the conversation"}
        </button>
      </form>
      {formError && (
        <p className="text-white/80 text-sm mt-3 text-center">{formError}</p>
      )}
    </div>
  );
}
