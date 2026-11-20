"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const INTERESTS = [
  "Introships from our careers",
  "Sponsoring a season",
  "Sponsoring a school or program",
  "Coaching",
  "Not sure yet",
];

/** Company inquiry. Posts to the same intake as before (/api/partner-waitlist,
 *  role "Corporate Partner"), so it lands in the partner waitlist and emails
 *  the team. Never shows success unless the request succeeded. */
export default function CompaniesContactForm() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", role: "", interest: INTERESTS[0] });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.company.trim()) {
      setError("Please fill in your name, email, and company.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          email: form.email.trim(),
          role: "Corporate Partner",
          teen_count: "",
          company: form.company.trim(),
          role_category: form.role.trim(),
          problem_to_solve: `Interested in: ${form.interest}`,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("companies_inquiry_submitted", { interest: form.interest });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p role="status" style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 18, lineHeight: 1.5, color: "var(--ink)", margin: 0 }}>
        Got it. Remi will reach out directly.
      </p>
    );
  }

  const field = (name: keyof typeof form, label: string, type = "text", required = true, autoComplete?: string) => (
    <div>
      <label htmlFor={`co-${name}`} className="aa-label">
        {label}
      </label>
      <input id={`co-${name}`} name={name} type={type} value={form[name]} onChange={set} required={required} autoComplete={autoComplete} className="aa-field" />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 16 }}>
      {field("firstName", "First name", "text", true, "given-name")}
      {field("lastName", "Last name", "text", true, "family-name")}
      {field("email", "Email", "email", true, "email")}
      {field("company", "Company", "text", true, "organization")}
      {field("role", "Role", "text", false, "organization-title")}
      <div>
        <label htmlFor="co-interest" className="aa-label">
          Interested in
        </label>
        <select id="co-interest" name="interest" value={form.interest} onChange={set} className="aa-field">
          {INTERESTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {error && (
          <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: "#B42318", margin: 0 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="aa-pill aa-pill--primary aa-pill--lg" style={{ width: "100%", opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Sending…" : "Start the conversation"}
        </button>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, textAlign: "center" }}>We&apos;ll reach out personally, usually the same day.</p>
      </div>
    </form>
  );
}
