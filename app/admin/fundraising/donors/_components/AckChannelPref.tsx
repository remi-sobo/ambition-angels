"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACK_CHANNELS, CHANNEL_LABEL } from "@/lib/fundraising/ack-channels";

// Set how this donor prefers to be thanked. The composer defaults to it; null
// means no preference (use the rule/default).
export default function AckChannelPref({
  constituentId,
  current,
}: {
  constituentId: string;
  current: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/constituents/${constituentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_ack_channel: value || null }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-3 text-xs items-center">
      <span className="text-ink-3 w-16 flex-shrink-0 uppercase tracking-wider font-semibold">Thank via</span>
      <select
        value={current ?? ""}
        disabled={busy}
        onChange={(e) => save(e.target.value)}
        className="bg-tile border-[1.5px] border-outline rounded-lg px-2 py-1 text-ink-1 text-xs focus:outline-none focus:border-orange/40 disabled:opacity-50"
      >
        <option value="">No preference</option>
        {ACK_CHANNELS.map((ch) => (
          <option key={ch} value={ch}>
            {CHANNEL_LABEL[ch]}
          </option>
        ))}
      </select>
    </div>
  );
}
