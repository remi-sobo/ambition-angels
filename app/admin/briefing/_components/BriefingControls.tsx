"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/briefing", { method: "POST" });
      if (!res.ok) alert("Briefing generation failed — check ANTHROPIC_API_KEY.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void generate()}
      disabled={busy}
      className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
    >
      {busy ? "Thinking…" : "✦ Generate briefing"}
    </button>
  );
}
