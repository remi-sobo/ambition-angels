"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RetryButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetch("/api/site-admin/forms/retry", { method: "POST" }).catch(() => null);
          const j = res ? await res.json().catch(() => ({})) : {};
          setMsg(res?.ok ? `Tried ${j.tried}: ${j.delivered} delivered, ${j.stillPending} still waiting, ${j.dead} rejected.` : "Retry failed.");
          setBusy(false);
          router.refresh();
        }}
        className="bg-orange hover:bg-orange-dark text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Retrying…" : "Retry now"}
      </button>
      {msg && <span className="text-xs text-gray-warm">{msg}</span>}
    </div>
  );
}
