"use client";

// Three doors, no forms: project a room (facilitator), join with the code
// off the wall (student), or play the same board solo. Room creation
// collects nothing — not even an email.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";

export default function CutLanding() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const normalized = normalizeClaimCode(code);

  const openRoom = async (solo: boolean) => {
    setBusy(solo ? "solo" : "host");
    setNotice(null);
    try {
      const res = await fetch("/api/games/the-cut/room", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? "Something went wrong — try again.");
        return;
      }
      const suffix = solo ? "&solo=1" : "";
      router.push(`/teens/the-cut/room/${j.roomCode}?host=${j.hostToken}${suffix}`);
    } catch {
      setNotice("Network hiccup — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-ink text-cream flex flex-col"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      <header className="px-6 pt-6 max-w-2xl w-full mx-auto">
        <Link href="/teens" className="font-body text-sm text-cream/50 hover:text-cream">
          &larr; Games
        </Link>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-5">
          Ages 14&ndash;18 &middot; one board, whole class
        </p>
        <h1 className="font-display text-6xl sm:text-7xl leading-[0.95]">
          The <span className="text-orange">Cut</span>
        </h1>
        <p className="font-body text-lg text-cream/70 mt-6 max-w-md leading-relaxed">
          Six real careers on the board. One rule at a time. Vote on who gets
          cut — last career standing wins the spotlight.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 w-full max-w-sm">
          <button
            onClick={() => openRoom(false)}
            disabled={busy !== null}
            className="w-full bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-10 py-4 rounded-full disabled:opacity-50"
          >
            {busy === "host" ? "Opening a room…" : "Put it on the projector"}
          </button>
          <button
            onClick={() => openRoom(true)}
            disabled={busy !== null}
            className="w-full border border-cream/30 hover:border-cream transition-colors text-cream font-heading font-semibold px-10 py-3.5 rounded-full disabled:opacity-50"
          >
            {busy === "solo" ? "Dealing…" : "Play solo"}
          </button>

          <form
            className="flex items-center gap-2.5 mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (normalized.length === ROOM_CODE_LENGTH) {
                router.push(`/teens/the-cut/vote/${normalized}`);
              }
            }}
          >
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Room code"
              className="w-40 bg-transparent border border-cream/25 focus:border-orange outline-none rounded-2xl px-4 py-3 text-center font-display text-2xl tracking-[0.2em] text-cream placeholder:text-cream/20 placeholder:text-base placeholder:tracking-normal"
            />
            <button
              type="submit"
              disabled={normalized.length !== ROOM_CODE_LENGTH}
              className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-7 py-3.5 rounded-full disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </div>

        {notice && (
          <p className="font-body text-sm text-orange mt-6 max-w-sm">{notice}</p>
        )}
        <p className="font-body text-sm text-cream/40 mt-8">
          No sign-up, no email, no app — phones and one screen.
        </p>
      </div>
      <footer className="px-6 py-5 text-center">
        <p className="font-body text-[11px] text-cream/30">
          Career data: U.S. Department of Labor O*NET&reg; and Bureau of Labor Statistics.
        </p>
      </footer>
    </div>
  );
}
