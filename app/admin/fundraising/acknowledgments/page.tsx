import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { money } from "../../finance/_components/charts";
import StatCard from "../../_components/StatCard";
import { constituentName } from "@/lib/fundraising/display";
import {
  complianceBlock,
  requiresSubstantiation,
  IRS_SUBSTANTIATION_THRESHOLD,
  type ReceiptGift,
} from "@/lib/fundraising/receipt";
import { reconcileAckQueue, type AckQueueGift } from "@/lib/fundraising/ack-tasks";
import { ensureEscalationsForQueue } from "@/lib/fundraising/stewardship";
import { type AckChannel } from "@/lib/fundraising/ack-channels";
import AckComposer, { type AckTemplateLite } from "./_components/AckComposer";
import ThankathonButton from "./_components/ThankathonButton";
import LogAckButton from "./_components/LogAckButton";
import { TYPE } from "@/lib/admin/typeScale";

// The acknowledgments queue: every gift awaiting a thank-you, oldest first.
// In v2 each pending thank-you is also a real `ops_task` (label `sys:ack`), so
// it flows to the cockpit, the Ops queue, and the Right Rail. Loading this page
// reconciles the queue with its tasks, so Stripe and pledge gifts get a task
// even though their gift rows are created outside the app. The IRS clock
// matters: gifts ≥ $250 legally require a contemporaneous written receipt.
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const daysSince = (iso: string) =>
  Math.max(Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000), 0);

export default async function AcknowledgmentsPage() {
  const supabase = createServerSupabase();
  const ctx = await getOrgContext();
  const createdBy = await getAdminUser();

  let pending: AckQueueGift[] = [];
  if (ctx && createdBy) {
    pending = await reconcileAckQueue(supabase, ctx.orgId, createdBy);
    // Major gifts also get a task for their escalation owner (e.g. Remi), on top
    // of Shannon's. Covers Stripe and pledge gifts that never run the matrix.
    await ensureEscalationsForQueue(supabase, ctx.orgId, createdBy, pending);
  }

  // Gift-subject templates for the composer's per-channel picker (empty until
  // the library is seeded or the Phase 1 migration is applied).
  const { data: tplData } = await supabase
    .from("ack_templates")
    .select("id, name, channel, subject, body")
    .eq("subject_type", "gift")
    .order("name");
  const templates = (tplData ?? []) as AckTemplateLite[];

  // IRS substantiation is derived from the gift amount via the compliance
  // module's threshold, not a literal in this view.
  const required = pending.filter((g) => requiresSubstantiation(g.amount));
  const oldest = pending[0];

  return (
    <div className="min-h-screen bg-ink">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 sm:py-4 sticky admin-sticky-top z-30 flex items-center gap-3">
        <Link href="/admin/fundraising/donors" className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors">
          ← Donors
        </Link>
        <span className={`${TYPE.cardTitle} sm:text-base`}>Acknowledgments</span>
        <div className="ml-auto flex items-center gap-4">
          <LogAckButton />
          <ThankathonButton count={pending.length} />
          <Link
            href="/admin/fundraising/acknowledgments/letters"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Letters →
          </Link>
          <Link
            href="/admin/fundraising/acknowledgments/templates"
            className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
          >
            Templates →
          </Link>
        </div>
      </div>

      <div className="max-w-[1100px] px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Awaiting Thanks"
            value={pending.length}
            sub={pending.length > 0 ? "oldest first below" : "all caught up 🎉"}
          />
          <StatCard
            label={`IRS-Required (≥ $${IRS_SUBSTANTIATION_THRESHOLD})`}
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
            <p className={`p-8 ${TYPE.bodyMuted}`}>
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
                          {g.taskId ? " · in your queue" : null}
                        </div>
                      </div>
                      {requiresSubstantiation(g.amount) && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense uppercase tracking-wider">
                          Receipt required
                        </span>
                      )}
                      <AckComposer
                        giftId={g.id}
                        donorName={g.constituent ? constituentName(g.constituent) : "there"}
                        donorEmail={email}
                        complianceBlock={complianceBlock(receiptGift)}
                        templates={templates}
                        defaultChannel={(g.constituent?.preferred_ack_channel as AckChannel | null) ?? null}
                        orgName={ctx?.orgName ?? "our organization"}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-xs text-ink-2 leading-relaxed max-w-2xl">
          Each pending thank-you is also a task on the Ops queue and the Right Rail, linked to the
          donor. The receipt language (gift amount, date, the no-goods-or-services statement, and the
          quid-pro-quo split when a fair market value is recorded) is generated from the gift record
          and appended to every email automatically. It is never AI-written and never editable. AI
          drafts only the personal note, and nothing sends without your review.
        </p>
      </div>
    </div>
  );
}
