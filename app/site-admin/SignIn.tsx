"use client";

import { useState } from "react";

// Website admin sign-in: a magic link to an address on SITE_ADMIN_EMAILS.
// The response is the same whether or not the address is on the list, so
// the form never reveals who has access.

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/site-admin/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-gray-light rounded-card p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-orange mb-2">Ambition Angels</p>
        <h1 className="font-heading font-semibold text-2xl mb-1">Website admin</h1>
        <p className="text-sm text-gray-warm mb-6">Careers, games and site numbers.</p>
        {state === "sent" ? (
          <p className="text-sm text-charcoal">
            If that address has access, a sign-in link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-semibold" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-mid rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full bg-orange hover:bg-orange-dark text-white font-semibold rounded-lg py-2.5 text-sm disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {state === "error" && <p className="text-xs text-orange-dark">Something went wrong. Try again.</p>}
          </form>
        )}
        <p className="text-xs text-gray-warm mt-6">
          Looking for BloomOS?{" "}
          <a href="https://app.bloomos.org" className="underline underline-offset-2">
            Go to app.bloomos.org
          </a>
          .
        </p>
      </div>
    </div>
  );
}
