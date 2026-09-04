"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function V2ShellToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/v2-shell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setError(j?.error ?? "Could not update the flag.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-card border border-outline bg-white/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-heading font-bold text-sm text-ink-1">
            {enabled ? "V2 shell is ON for you" : "V2 shell is off — you're on V1"}
          </div>
          <div className="text-[11px] text-ink-2 mt-0.5">
            Per-user. Switch back any time from this page.
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => flip(!enabled)}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-colors disabled:opacity-50 ${
            enabled
              ? "border border-outline text-ink-1 hover:bg-gray-light"
              : "bg-orange text-white hover:bg-orange-dark"
          }`}
        >
          {busy ? "…" : enabled ? "Switch back to V1" : "Turn on the V2 shell"}
        </button>
      </div>
      {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}
    </div>
  );
}
