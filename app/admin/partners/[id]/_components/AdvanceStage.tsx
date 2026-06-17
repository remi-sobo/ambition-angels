"use client";

// One-tap "Move to <next stage>" button in the profile header.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdvanceStage({ partnerId, next, label }: {
  partnerId: string; next: string; label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/partners/manage/${partnerId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            alert(j.error ?? `HTTP ${res.status}`);
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="ml-auto text-[11px] font-semibold px-3 py-1 rounded-full bg-orange/15 text-orange hover:bg-orange/25 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      {busy ? "…" : `${label} →`}
    </button>
  );
}
