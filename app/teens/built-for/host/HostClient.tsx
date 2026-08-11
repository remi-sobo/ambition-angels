"use client";

// Facilitator entry (Phase 5). An adult opens a room, gets the 4-character
// code for the wall, and a host link that carries the host token — the
// projected screen needs it for the two host-only actions.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HostClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col items-center justify-center px-6">
      <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-5">
        For facilitators
      </p>
      <h1 className="font-display text-5xl sm:text-6xl leading-[0.95] text-center max-w-lg">
        Open a room
      </h1>
      <p className="font-body text-cream/60 mt-5 max-w-md text-center">
        You get a room code for the screen. Students join from their own phones. At the end,
        every student&rsquo;s deck lands in your inbox in one email — with a conversation
        starter for each of them.
      </p>
      <form
        className="mt-8 flex flex-col gap-3 w-full max-w-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/ms/room", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ host_email: email }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(data.error ?? "Something went wrong");
              return;
            }
            router.push(`/teens/built-for/room/${data.roomCode}?host=${data.hostToken}`);
          } catch {
            setError("Something went wrong");
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
          placeholder="your@email.com — the decks go here"
          className="w-full bg-transparent border border-cream/25 focus:border-orange outline-none rounded-full px-6 py-4 font-body text-cream placeholder:text-cream/25"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-8 py-4 rounded-full disabled:opacity-60"
        >
          {busy ? "Opening…" : "Open the room"}
        </button>
        {error && <p className="font-body text-sm text-orange text-center">{error}</p>}
      </form>
    </div>
  );
}
