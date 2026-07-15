"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TYPE } from "@/lib/admin/typeScale";

export type ReconItem = {
  id: string;
  kind: "commitment" | "flag";
  source: "hubspot" | "gmail" | "stripe" | "manual";
  status: "pending" | "accepted" | "dismissed";
  title: string;
  detail: string | null;
  amount: number | null;
  evidence_url: string | null;
  confidence: "high" | "medium" | "low" | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  hubspot: { label: "HubSpot", cls: "bg-orange/10 text-orange border-orange/30" },
  gmail: { label: "Email", cls: "bg-revenue/10 text-revenue border-revenue/30" },
  stripe: { label: "Stripe", cls: "bg-navy/10 text-navy border-navy/30" },
  manual: { label: "Manual", cls: "bg-ink/5 text-ink-2 border-outline" },
};

const fmtMoney = (n: number | null) =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Card({ item, onResolve }: { item: ReconItem; onResolve: (id: string, action: "accept" | "dismiss") => void }) {
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null);
  const src = SOURCE_META[item.source] ?? SOURCE_META.manual;

  async function act(action: "accept" | "dismiss") {
    setBusy(action);
    try {
      const r = await fetch(`/api/admin/finance/reconciliation/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? "Failed");
      onResolve(item.id, action);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save — try again.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-card border-[1.5px] border-outline bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${src.cls}`}>
              {src.label}
            </span>
            {item.kind === "flag" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide border border-status-watch-text/30 text-status-watch-text rounded px-1.5 py-0.5">
                Needs a look
              </span>
            )}
            {item.confidence && (
              <span className="text-[10px] text-ink-3 capitalize">{item.confidence} confidence</span>
            )}
          </div>
          <h3 className="mt-1.5 font-heading font-semibold text-ink-1 text-[15px] leading-snug">
            {item.title}
            {item.amount != null && <span className="ml-2 text-revenue">{fmtMoney(item.amount)}</span>}
          </h3>
          {item.detail && <p className="mt-1 text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">{item.detail}</p>}
          {item.evidence_url && (
            <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[11px] text-orange hover:text-orange-dark underline">
              View source ↗
            </a>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-1.5 shrink-0 w-28">
          {item.kind === "commitment" && (
            <button
              onClick={() => act("accept")}
              disabled={!!busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-orange text-white hover:bg-orange-dark transition-colors disabled:opacity-60"
            >
              {busy === "accept" ? "Adding…" : "Add to ledger"}
            </button>
          )}
          <button
            onClick={() => act("dismiss")}
            disabled={!!busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-outline text-ink-2 hover:text-ink-1 hover:bg-[#EFE6D4] transition-colors disabled:opacity-60"
          >
            {busy === "dismiss" ? "…" : item.kind === "flag" ? "Resolve" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReconcileInbox({ pending, resolved }: { pending: ReconItem[]; resolved: ReconItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(pending);

  function onResolve(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Refresh so dashboard/pledges pick up an accepted commitment.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className={TYPE.cardTitle}>
            To review <span className="text-ink-3 font-normal">· {items.length}</span>
          </h2>
        </div>
        {items.length === 0 ? (
          <div className="rounded-card border-[1.5px] border-dashed border-outline bg-surface/50 p-8 text-center">
            <p className="text-sm text-ink-2 font-medium">Inbox zero. 🎉</p>
            <p className="mt-1 text-xs text-ink-3">
              Nothing to reconcile right now. Ask Cowork to run a sweep, or it&apos;ll post here on the weekly run.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((it) => (
              <Card key={it.id} item={it} onResolve={onResolve} />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className={`${TYPE.cardTitle} mb-2.5`}>Recently resolved</h2>
          <div className="rounded-card border-[1.5px] border-outline bg-surface divide-y divide-hairline">
            {resolved.map((it) => (
              <div key={it.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-2 truncate">
                  {it.title}
                  {it.amount != null && <span className="ml-1.5 text-ink-3">{fmtMoney(it.amount)}</span>}
                </span>
                <span className={`shrink-0 font-semibold ${it.status === "accepted" ? "text-revenue" : "text-ink-3"}`}>
                  {it.status === "accepted" ? "Added ✓" : "Dismissed"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
