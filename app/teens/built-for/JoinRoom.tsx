"use client";

// "I have a room code" (Phase 5). Four characters off the wall, then
// straight into the assessment — the session joins the room when it lands.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeClaimCode, ROOM_CODE_LENGTH } from "@/lib/ms/claim";

export default function JoinRoom() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const normalized = normalizeClaimCode(code);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 font-body text-sm text-cream/50 hover:text-cream underline underline-offset-4"
      >
        I have a room code
      </button>
    );
  }

  return (
    <form
      className="mt-5 flex items-center gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized.length === ROOM_CODE_LENGTH) {
          router.push(`/teens/built-for/assess?room=${normalized}`);
        }
      }}
    >
      <input
        type="text"
        autoFocus
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="AB2C"
        className="w-36 bg-transparent border border-cream/25 focus:border-orange outline-none rounded-2xl px-4 py-3 text-center font-display text-3xl tracking-[0.25em] text-cream placeholder:text-cream/20"
      />
      <button
        type="submit"
        disabled={normalized.length !== ROOM_CODE_LENGTH}
        className="bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold px-7 py-3.5 rounded-full disabled:opacity-40"
      >
        Join
      </button>
    </form>
  );
}
