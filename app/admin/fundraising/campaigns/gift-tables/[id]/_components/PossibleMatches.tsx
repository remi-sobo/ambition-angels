"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/admin/_components/feedback/ToastProvider";
import { userMessage, networkMessage } from "@/lib/admin/errors";
import { TYPE } from "@/lib/admin/typeScale";
import { Alert, Button, Card } from "@/app/admin/_components/ui";

/**
 * Possible matches (specs/fundraising-gift-tables.md, Phase 3 · Money
 * attribution).
 *
 * Money in the window, from a household already placed on this table, that is
 * NOT traceable to it. Traceable means exactly three things: an opportunity
 * linked to a placement here, a campaign linked to this table, or an explicit
 * credit row. Anything else is a suggestion, and it fills nothing until a
 * human attaches it.
 *
 * That restraint is the point. A gap that closes because software guessed is
 * a gap nobody went and worked, and the whole value of the last column is
 * that it is true.
 */

export type MatchRow = {
  sourceType: "gift" | "pledge" | "recurring_plan" | "grant";
  sourceId: string;
  label: string;
  amount: number;
  occurredOn: string;
  reason: string;
};

const money = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

const SOURCE_WORD: Record<MatchRow["sourceType"], string> = {
  gift: "gift",
  pledge: "pledge",
  recurring_plan: "recurring plan",
  grant: "grant",
};

export default function PossibleMatches({
  tableId,
  matches,
  canWrite,
}: {
  tableId: string;
  matches: MatchRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (matches.length === 0) return null;

  const attach = async (m: MatchRow) => {
    setBusy(m.sourceId);
    setError("");
    try {
      const res = await fetch(`/api/admin/fundraising/gift-tables/${tableId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: m.sourceType, source_id: m.sourceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(userMessage(res, body));
        return;
      }
      toast.success(
        body.also_credited_to > 0
          ? `Attached. Heads up: this money is also credited to ${body.also_credited_to} other table${body.also_credited_to === 1 ? "" : "s"}.`
          : "Attached to this table.",
      );
      router.refresh();
    } catch {
      setError(networkMessage());
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      <p className={`${TYPE.metadata} mb-3`}>
        Money in this window from a household on this table, not traceable to it. It counts for
        nothing until you attach it.
      </p>
      <ul className="space-y-1">
        {matches.map((m) => (
          <li
            key={`${m.sourceType}:${m.sourceId}`}
            className="flex items-center justify-between gap-3 rounded-control bg-tile px-3 py-2"
          >
            <div className="min-w-0">
              <span className={`${TYPE.body} font-medium`}>{m.label}</span>
              <span className={`${TYPE.metadata} block`}>
                {money(m.amount)} {SOURCE_WORD[m.sourceType]} on {m.occurredOn}
              </span>
            </div>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => attach(m)}
                disabled={busy === m.sourceId}
              >
                {busy === m.sourceId ? "Attaching…" : "Attach"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
