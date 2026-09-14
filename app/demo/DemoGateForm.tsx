"use client";

import { useState } from "react";

/**
 * The password form on /demo. A plain <form method="POST"> so the check
 * happens on the server (app/demo/login/route.ts) and works without JS; the
 * only client behavior is disabling the button while the POST is in flight.
 */
export default function DemoGateForm({ error }: { error: boolean }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form method="POST" action="/demo/login" onSubmit={() => setSubmitting(true)}>
      <label
        htmlFor="demo-password"
        className="block font-heading text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-warm"
      >
        Password
      </label>
      <input
        id="demo-password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className="mt-2 block w-full rounded-full border border-cream/[0.18] bg-cream/[0.06] px-5 py-[15px] font-body text-base text-white outline-none transition focus:border-orange focus:shadow-[0_0_0_3px_rgba(232,80,10,0.18)]"
      />
      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-orange font-heading text-[15px] font-semibold text-white transition hover:bg-[#C24308] disabled:cursor-default disabled:opacity-80 disabled:hover:bg-orange"
      >
        {submitting ? "Opening" : "Open the demo"}
      </button>
      {/* Reserved height so the layout does not jump when the error appears. */}
      <p className="mt-3 min-h-[1.5rem] font-body text-sm leading-6 text-orange" role="alert" aria-live="polite">
        {error ? "That password does not match. Check it and try again." : ""}
      </p>
    </form>
  );
}
