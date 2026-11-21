"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/admin/_components/ui/Button";
import Badge, { type BadgeTone } from "@/app/admin/_components/ui/Badge";
import ListRow, { ListRows } from "@/app/admin/_components/ui/ListRow";
import { useSaveAction } from "@/app/admin/_lib/useSaveAction";
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

const SOURCE_META: Record<string, { label: string; tone: BadgeTone }> = {
  hubspot: { label: "HubSpot", tone: "neutral" },
  gmail: { label: "Email", tone: "neutral" },
  stripe: { label: "Stripe", tone: "neutral" },
  manual: { label: "Manual", tone: "neutral" },
};

const fmtMoney = (n: number | null) =>
  n == null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// The reconcile inbox (V4 Stage G2: kit ListRow, Badge and Button; writes
// through saveAction). Accepting books money, so nothing is optimistic: a
// row leaves the list only after the server confirms.
function Row({ item, onResolve }: { item: ReconItem; onResolve: (id: string) => void }) {
  const save = useSaveAction();
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null);
  const src = SOURCE_META[item.source] ?? SOURCE_META.manual;

  async function act(action: "accept" | "dismiss") {
    setBusy(action);
    const r = await save({
      request: { url: `/api/admin/finance/reconciliation/${item.id}`, method: "PATCH", body: { action } },
      success: action === "accept" ? "Added to the ledger" : item.kind === "flag" ? "Resolved" : "Dismissed",
    });
    setBusy(null);
    if (r.ok) onResolve(item.id);
  }

  return (
    <ListRow
      title={
        <>
          {item.title}
          {item.amount != null ? <span className="ml-2 tabular-nums">{fmtMoney(item.amount)}</span> : null}
        </>
      }
      meta={
        <>
          <Badge tone={src.tone}>{src.label}</Badge>
          {item.kind === "flag" ? <Badge tone="warning">Needs a look</Badge> : null}
          {item.confidence ? <span className="text-xs text-ink-2 capitalize">{item.confidence} confidence</span> : null}
        </>
      }
      context={
        <>
          {item.detail ? <span className="whitespace-pre-wrap">{item.detail}</span> : null}
          {item.evidence_url ? (
            <>
              {item.detail ? " " : null}
              <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                View source
              </a>
            </>
          ) : null}
        </>
      }
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => act("dismiss")} loading={busy === "dismiss"} disabled={!!busy}>
            {item.kind === "flag" ? "Resolve" : "Dismiss"}
          </Button>
          {item.kind === "commitment" ? (
            <Button size="sm" onClick={() => act("accept")} loading={busy === "accept"} disabled={!!busy}>
              Add to ledger
            </Button>
          ) : null}
        </>
      }
    />
  );
}

export default function ReconcileInbox({ pending, resolved }: { pending: ReconItem[]; resolved: ReconItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(pending);

  function onResolve(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Re-read so the snapshot and forecast pick up an accepted commitment.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="bg-surface border border-hairline rounded-panel px-5">
        <h3 className={`${TYPE.cardTitle} pt-4`}>
          To review <span className="text-ink-2 font-normal">· {items.length}</span>
        </h3>
        {items.length === 0 ? (
          <p className={`${TYPE.bodyMuted} py-6`}>
            Nothing to reconcile right now. New proposals arrive with the weekly sweep.
          </p>
        ) : (
          <ListRows>
            {items.map((it) => (
              <Row key={it.id} item={it} onResolve={onResolve} />
            ))}
          </ListRows>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="bg-surface border border-hairline rounded-panel px-5">
          <h3 className={`${TYPE.cardTitle} pt-4`}>Recently resolved</h3>
          <ListRows>
            {resolved.map((it) => (
              <ListRow
                key={it.id}
                title={
                  <span className="font-normal text-ink-2">
                    {it.title}
                    {it.amount != null ? <span className="ml-1.5 tabular-nums">{fmtMoney(it.amount)}</span> : null}
                  </span>
                }
                actions={
                  <Badge tone={it.status === "accepted" ? "success" : "neutral"}>
                    {it.status === "accepted" ? "Added" : "Dismissed"}
                  </Badge>
                }
              />
            ))}
          </ListRows>
        </section>
      ) : null}
    </div>
  );
}
