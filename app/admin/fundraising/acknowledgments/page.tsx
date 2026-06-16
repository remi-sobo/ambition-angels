import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import { complianceBlock, type ReceiptGift } from "@/lib/fundraising/receipt";
import AckComposer from "./_components/AckComposer";

// The acknowledgments queue (modules/03 §Donors 4): every gift awaiting a
// thank-you, oldest first. The IRS clock matters — gifts ≥ $250 legally
// require a contemporaneous written acknowledgment before the donor files.
export const dynamic = "force-dynamic";

type PendingGift = {
  id: string;
  amount: number;
  gift_date: string;
  method: string;
  fair_market_value: number | null;
  deductible_amount: number | null;
  constituent: {
    type: string;
    first_name: string | null;
    last_name: string | null;
    org_name: string | null;
    emails: string[];
  } | null;
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const daysSince = (iso: string) =>
  Math.max(Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000), 0);

export default async function AcknowledgmentsPage() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, fair_market_value, deductible_amount, constituent:constituents(type, first_name, last_name, org_name, emails)"
    )
    .eq("acknowledgment_status", "pending")
    .order("gift_date", { ascending: true })
    .limit(200);

  if (error) {
    return (
      <div className="min-h-screen bg-ink p-6 lg:p-10">
        <h1 className="font-heading font-bold text-ink-1 text-2xl mb-4">Acknowledgments</h1>
        <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
          The fundraising tables aren&apos;t in this database yet. Apply{" "}
          <code className="text-orange">create_fundraising_core.sql</code> via Actions → Apply DB
          migration, then reload.
        </div>
      </div>
    );
  }

  const pending = ((data ?? []) as unknown as PendingGift[]).map((g) => ({
    ...g,
    amount: Number(g.amount),
  }));
  const required = pending.filter((g) => g.amount >= 250);
  const oldest = pending[0];

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Donors
        </Link>
        <span className="font-heading font-bold text-ink-1 text-sm sm:text-base">Acknowledgments</span>
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Awaiting Thanks"
            value={pending.length}
            sub={pending.length > 0 ? "oldest first below" : "all caught up 🎉"}
          />
          <StatCard
            label="IRS-Required (≥ $250)"
            value={required.length}
            delta={required.length > 0 ? { text: "written receipt required", direction: "down" } : undefined}
            sub={required.length === 0 ? "none outstanding" : undefined}
            muted={required.length === 0}
          />
          <StatCard
            label="Oldest Waiting"
            value={oldest ? `${daysSince(oldest.gift_date)}d` : "—"}
            sub={oldest ? `gift on ${fmtDate(oldest.gift_date)}` : undefined}
          />
        </div>

        <section className="bg-tile shadow-tile border-[1.5px] border-outline rounded-card-lg overflow-hidden">
          {pending.length === 0 ? (
            <p className="p-8 text-ink-2 text-sm">
              Every gift has been thanked. New Stripe donations of $250+ will appear here
              automatically; smaller gifts are marked not-required but can still be thanked from
              the donor&apos;s profile.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {pending.map((g) => {
                const receiptGift: ReceiptGift = {
                  amount: g.amount,
                  gift_date: g.gift_date,
                  method: g.method,
                  fair_market_value: g.fair_market_value === null ? null : Number(g.fair_market_value),
                  deductible_amount: g.deductible_amount === null ? null : Number(g.deductible_amount),
                };
                const email = g.constituent?.emails?.[0] ?? null;
                return (
                  <li key={g.id} className="px-5 py-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums] w-24">
                        {money(g.amount)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink-1 font-medium truncate">
                          {g.constituent ? constituentName(g.constituent) : "Anonymous"}
                        </div>
                        <div className="text-[11px] text-ink-2">
                          {fmtDate(g.gift_date)} · {daysSince(g.gift_date)}d ago
                          {email ? ` · ${email}` : " · no email on file"}
                        </div>
                      </div>
                      {g.amount >= 250 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense uppercase tracking-wider">
                          Receipt required
                        </span>
                      )}
                      <AckComposer giftId={g.id} donorEmail={email} complianceBlock={complianceBlock(receiptGift)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-xs text-ink-2 leading-relaxed max-w-2xl">
          The receipt language (gift amount, date, the no-goods-or-services statement, and the
          quid-pro-quo split when a fair market value is recorded) is generated from the gift
          record and appended to every email automatically — it is never AI-written and never
          editable. AI drafts only the personal note, and nothing sends without your review.
        </p>
      </div>
    </div>
  );
}
