"use client";

// X7 — HubSpot connection controls. Connect/disconnect and toggle the three
// sync gates (outbound, inbound, gifts→deals). Writes go through the
// integrations API; the page reloads its server state after each change.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

type Flags = { sync_out: boolean; sync_in: boolean; sync_gifts_as_deals: boolean };

export default function HubSpotSettings({
  connected,
  tokenPresent,
  secretPresent,
  flags,
}: {
  connected: boolean;
  tokenPresent: boolean;
  secretPresent: boolean;
  flags: Flags;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/integrations/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const Toggle = ({ flag, label, help, warn }: { flag: keyof Flags; label: string; help: string; warn?: string }) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-1">{label}</div>
        <div className="text-[11px] text-ink-3 leading-snug">{help}</div>
        {warn && flags[flag] && <div className="text-[11px] text-[#A56A1B] mt-0.5">{warn}</div>}
      </div>
      <button
        role="switch"
        aria-checked={flags[flag]}
        disabled={busy || !connected}
        onClick={() => call({ action: "set_flags", [flag]: !flags[flag] })}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${flags[flag] ? "bg-orange" : "bg-gray-mid/40"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${flags[flag] ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );

  return (
    <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-outline flex items-center justify-between gap-3">
        <div>
          <h2 className={TYPE.cardTitle}>HubSpot</h2>
          <p className="text-[11px] text-ink-3">Two-way CRM sync for orgs that run HubSpot</p>
        </div>
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${connected ? "bg-revenue/15 text-revenue" : "bg-tile text-ink-3 border border-outline"}`}>
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        {!tokenPresent && (
          <div className="text-[11px] text-[#A56A1B] bg-[#F4E8D0] rounded-lg px-3 py-2">
            <code>HUBSPOT_ACCESS_TOKEN</code> isn&apos;t set — outbound sync can&apos;t reach HubSpot until it is.
          </div>
        )}
        {!secretPresent && (
          <div className="text-[11px] text-[#A56A1B] bg-[#F4E8D0] rounded-lg px-3 py-2">
            <code>HUBSPOT_CLIENT_SECRET</code> isn&apos;t set — inbound webhooks will be rejected until it is.
          </div>
        )}

        <div className="divide-y divide-hairline">
          <Toggle flag="sync_out" label="Outbound sync" help="Push BloomOS donors, interactions, and opportunities to HubSpot as you edit them." warn={!tokenPresent ? "Needs HUBSPOT_ACCESS_TOKEN to take effect." : undefined} />
          <Toggle flag="sync_in" label="Inbound webhooks" help="Apply HubSpot contact/company changes back to the linked constituents." warn={!secretPresent ? "Needs HUBSPOT_CLIENT_SECRET to take effect." : undefined} />
          <Toggle flag="sync_gifts_as_deals" label="Gifts → Deals" help="Also mirror each recorded gift to HubSpot as a closed-won deal (off by default — opinionated)." />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-outline flex items-center gap-3">
        {connected ? (
          <button
            disabled={busy}
            onClick={() => { if (confirm("Disconnect HubSpot? Sync stops immediately.")) void call({ action: "disconnect" }); }}
            className="text-xs font-semibold text-ink-2 hover:text-expense border-[1.5px] border-outline bg-tile px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => call({ action: "connect" })}
            className="text-xs font-semibold text-white bg-orange hover:bg-orange-dark px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            Connect HubSpot
          </button>
        )}
        <span className="text-[11px] text-ink-3">
          {connected ? "Toggle each direction above; standalone otherwise." : "Connecting enables the toggles. BloomOS stays the system of record."}
        </span>
      </div>
    </section>
  );
}
