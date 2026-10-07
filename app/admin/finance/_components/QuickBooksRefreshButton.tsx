"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Refresh now" for the QuickBooks pull. The daily cron keeps it current; this
// is for when someone just cleared the For Review queue and wants it now.
export default function QuickBooksRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/finance/quickbooks/sync", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "Refresh failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-xs text-expense">{err}</span>}
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink-1 hover:bg-surface disabled:opacity-40"
      >
        {busy ? "Refreshing…" : "Refresh now"}
      </button>
    </span>
  );
}
