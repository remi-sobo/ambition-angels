"use client";

// The adult handoff. This is the ONLY email field in the whole /ms
// product, and the screen says who it is for before the field appears —
// COPPA by construction, not by policy (locked decision 10).

import { useState } from "react";

export default function SendToAdult({ claimCode, hasCards }: { claimCode: string; hasCards: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasCards) return null;

  if (sent) {
    return (
      <div className="mt-10 rounded-2xl border border-orange/40 bg-orange/10 px-6 py-5">
        <p className="font-heading font-semibold">Sent.</p>
        <p className="font-body text-sm text-cream/70 mt-1">
          Your grown-up has the deck and your code. It&rsquo;s safe now.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-2xl border border-cream/12 px-6 py-5">
      <p className="font-heading font-semibold text-lg">Send it to a grown-up</p>
      <p className="font-body text-sm text-cream/60 mt-1">
        This part is for an adult: a parent, a mentor, a teacher. Their email, not yours. They
        get your deck and your code so it can never get lost.
      </p>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-8 py-3 rounded-full"
        >
          I have a grown-up&rsquo;s email
        </button>
      ) : (
        <form
          className="mt-4 flex flex-col sm:flex-row gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/ms/deliver", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ claim_code: claimCode, email }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(data.error ?? "Sending failed. Try again.");
              } else {
                setSent(true);
              }
            } catch {
              setError("Sending failed. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="grown-up@email.com"
            className="flex-1 bg-transparent border border-cream/25 focus:border-orange outline-none rounded-full px-5 py-3 font-body text-cream placeholder:text-cream/25"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-8 py-3 rounded-full disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      )}
      {error && <p className="font-body text-sm text-orange mt-3">{error}</p>}
    </div>
  );
}
