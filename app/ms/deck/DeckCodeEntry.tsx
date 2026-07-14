"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeClaimCode, CLAIM_CODE_LENGTH } from "@/lib/ms/claim";

export default function DeckCodeEntry({ wrongCode }: { wrongCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const normalized = normalizeClaimCode(code);

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col items-center justify-center px-6">
      <p className="font-heading text-[11px] tracking-[0.3em] uppercase text-cream/50 mb-5">
        Your deck
      </p>
      <h1 className="font-display text-5xl sm:text-6xl leading-[0.95] text-center max-w-md">
        Type your six characters
      </h1>
      {wrongCode && (
        <p className="font-body text-orange mt-5 text-center">
          &ldquo;{wrongCode}&rdquo; didn&rsquo;t match a deck. Check it and try again.
        </p>
      )}
      <form
        className="mt-8 flex flex-col items-center gap-4 w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (normalized.length === CLAIM_CODE_LENGTH) router.push(`/ms/deck/${normalized}`);
        }}
      >
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AB2C3D"
          className="w-full bg-transparent border border-cream/25 focus:border-orange outline-none rounded-2xl px-6 py-4 text-center font-display text-4xl tracking-[0.3em] text-cream placeholder:text-cream/20"
        />
        <button
          type="submit"
          disabled={normalized.length !== CLAIM_CODE_LENGTH}
          className="w-full bg-orange hover:bg-orange-dark transition-colors text-white font-heading font-semibold text-lg px-8 py-4 rounded-full disabled:opacity-40"
        >
          Open my deck
        </button>
      </form>
    </div>
  );
}
