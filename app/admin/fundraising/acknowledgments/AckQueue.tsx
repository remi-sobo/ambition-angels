import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext, getAdminUser } from "@/lib/admin/auth";
import { money } from "../../finance/_components/charts";
import PageHeader from "../../_components/PageHeader";
import { constituentName } from "@/lib/fundraising/display";
import {
  complianceBlock,
  requiresSubstantiation,
  IRS_SUBSTANTIATION_THRESHOLD,
  type ReceiptGift,
} from "@/lib/fundraising/receipt";
import { resolveOrgEmailIdentity } from "@/lib/email/org-identity";
import { reconcileAckQueue, type AckQueueGift } from "@/lib/fundraising/ack-tasks";
import { ensureEscalationsForQueue } from "@/lib/fundraising/stewardship";
import { type AckChannel, CHANNEL_LABEL } from "@/lib/fundraising/ack-channels";
import Figure, { SummaryStrip } from "../../_components/ui/Figure";
import SavedViews from "../../_components/ui/SavedViews";
import DataTable, { type DataTableColumn } from "../../_components/ui/DataTable";
import EmptyState from "../../_components/EmptyState";
import { parseTableState, type TableSpec } from "@/lib/admin/dataTable";
import { todayInTZ } from "@/lib/admin/ops/week";
import { daysBetween, shortDay, usd } from "@/lib/fundraising/donorRecord";
import {
  THANK_VIEWS,
  filterThankYous,
  isThankView,
  nextStepFor,
  pageOf,
  sortThankYous,
  thankSummary,
  type ThankViewKey,
} from "@/lib/fundraising/thankYouList";
import ThankYouButton from "./_components/ThankYouButton";
import { RecordGiftButton, ReviewGiftButton } from "../_components/gift/GiftButtons";
import AckComposer, { type AckTemplateLite } from "./_components/AckComposer";
import ThankathonButton from "./_components/ThankathonButton";
import LogAckButton from "./_components/LogAckButton";
import { TYPE } from "@/lib/admin/typeScale";

// The acknowledgments queue: every gift awaiting a thank-you, oldest first.
// In v2 each pending thank-you is also a real `ops_task` (label `sys:ack`), so
// it flows to the cockpit, the Ops queue, and the Right Rail. Loading this
// reconciles the queue with its tasks, so Stripe and pledge gifts get a task
// even though their gift rows are created outside the app. The IRS clock
// matters: gifts ≥ $250 legally require a contemporaneous written receipt.
//
// Extracted at Spec Fundraising F5 ("Thank someone absorbed into Today"):
// the V1 route renders it standalone (embedded=false — output byte-identical
// to the pre-F5 page) and Fundraising → Today's Moves embeds it as its
// Thank-yous section — the SAME queue, the same reconciliation, the same
// composer with the non-editable receipt language, one write path. At F6
// the standalone route 308s to Today.

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const daysSince = (iso: string) =>
  Math.max(Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000), 0);

const BASE = "/admin/fundraising/acknowledgments";
// DataTable v2 spec: oldest gift first by default (the IRS clock), sortable
// by date and amount, 50 to a page.
const THANK_TABLE: TableSpec = {
  sortable: [{ key: "date", first: "asc" }, { key: "amount", first: "desc" }],
  defaultSort: { key: "date", dir: "asc" },
  pageSize: 50,
};

export default async function AckQueue({
  embedded = false,
  searchParams,
}: {
  embedded?: boolean;
  /** Standalone page only: view, sort, dir, page. */
  searchParams?: Record<string, string | undefined>;
}) {
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
  const { data: tplData } = ctx
    ? await supabase
        .from("ack_templates")
        .select("id, name, channel, subject, body")
        .eq("org_id", ctx.orgId)
        .eq("subject_type", "gift")
        .order("name")
    : { data: null };
  const templates = (tplData ?? []) as AckTemplateLite[];

  // IRS substantiation is derived from the gift amount via the compliance
  // module's threshold, not a literal in this view.
  // The receipt preview carries THIS org's tax statement. If the org hasn't
  // set up what a receipt needs, the preview shows why instead, and the send
  // route refuses with the same reason.
  const identity = ctx ? await resolveOrgEmailIdentity(supabase, ctx.orgId, "receipt") : null;
  const previewBlock = (g: ReceiptGift): string =>
    identity?.ok && identity.identity.taxStatement
      ? complianceBlock(g, identity.identity.taxStatement)
      : identity && !identity.ok
        ? identity.reason
        : "";

  const receiptOf = (g: AckQueueGift): ReceiptGift => ({
    amount: g.amount,
    gift_date: g.gift_date,
    method: g.method,
    fair_market_value: g.fair_market_value === null ? null : Number(g.fair_market_value),
    deductible_amount: g.deductible_amount === null ? null : Number(g.deductible_amount),
  });

  if (embedded) {
    // Fundraising → Today's "Thank someone" section: the same queue and
    // composer, plus (V4 B1) "Review gift", which opens the gift drawer on
    // that gift to fix it or mark it thanked.
    return (
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div>
            <h2 className={TYPE.cardTitle}>
              Thank someone <span className="text-ink-3 font-normal">· {pending.length}</span>
            </h2>
            <p className="text-xs text-ink-3">
              Gifts awaiting an acknowledgment. The receipt language is generated, never edited.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <LogAckButton />
            <ThankathonButton count={pending.length} />
            <Link
              href="/admin/fundraising/acknowledgments"
              className="text-xs font-semibold text-ink-2 hover:text-ink-1 transition-colors"
            >
              All thank-yous →
            </Link>
          </div>
        </div>
        <section className="bg-tile border-hairline rounded-panel-lg overflow-hidden">
          {pending.length === 0 ? (
            <p className={`p-8 ${TYPE.bodyMuted}`}>
              Every gift has been thanked. New Stripe donations of $250+ will appear here automatically; smaller gifts
              are marked not-required but can still be thanked from the donor&apos;s profile.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {pending.map((g) => {
                const email = g.constituent?.emails?.[0] ?? null;
                return (
                  <li key={g.id} className="px-5 py-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="font-bold text-ink-1 [font-variant-numeric:tabular-nums] w-24">{money(g.amount)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink-1 font-medium truncate">
                          {g.constituent ? constituentName(g.constituent) : "Anonymous"}
                        </div>
                        <div className="text-xs text-ink-2">
                          {fmtDate(g.gift_date)} · {daysSince(g.gift_date)}d ago
                          {email ? ` · ${email}` : " · no email on file"}
                          {g.taskId ? " · in your queue" : null}
                        </div>
                      </div>
                      {requiresSubstantiation(g.amount) && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-expense-bg text-expense uppercase tracking-wider">
                          Receipt required
                        </span>
                      )}
                      <ReviewGiftButton giftId={g.id} />
                      <AckComposer
                        giftId={g.id}
                        donorName={g.constituent ? constituentName(g.constituent) : "there"}
                        donorEmail={email}
                        complianceBlock={previewBlock(receiptOf(g))}
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
      </div>
    );
  }

  // ── Standalone: Fundraising → Thank-yous, the List archetype on DataTable
  // v2 (V4 B1). Views and sort live in the URL; the whole queue is already in
  // hand (reconciled above), so the page is cut here.
  const today = todayInTZ();
  type Row = AckQueueGift & { email: string | null; donor: string };
  const all: Row[] = pending.map((g) => ({
    ...g,
    email: g.constituent?.emails?.[0] ?? null,
    donor: g.constituent ? constituentName(g.constituent) : "Anonymous",
  }));
  const params = searchParams ?? {};
  const view: ThankViewKey = isThankView(params.view) ? params.view : "all";
  const state = parseTableState(params, THANK_TABLE);
  const inView = filterThankYous(all, view);
  const sortedRows = sortThankYous(inView, state.sort);
  const rows = pageOf(sortedRows, state.page, THANK_TABLE.pageSize);
  const sum = thankSummary(all, today);
  const filters: Record<string, string> = view !== "all" ? { view } : {};
  const viewCount = (k: ThankViewKey) => filterThankYous(all, k).length;

  const columns: DataTableColumn<Row>[] = [
    {
      key: "donor",
      header: "Donor",
      card: "title",
      render: (r) =>
        r.constituent_id ? (
          <Link href={`/admin/fundraising/donors-funders/${r.constituent_id}`} className="font-semibold text-ink-1 hover:underline underline-offset-2">
            {r.donor}
          </Link>
        ) : (
          <span className="font-semibold text-ink-1">{r.donor}</span>
        ),
    },
    { key: "amount", header: "Gift", align: "right", className: "font-semibold text-ink-1 tabular-nums", render: (r) => usd(r.amount) },
    {
      key: "date",
      header: "Given",
      className: "text-ink-2 tabular-nums",
      render: (r) => (
        <>
          {shortDay(r.gift_date, today)}
          <span className="block text-xs">
            {(() => {
              const d = Math.max(0, daysBetween(r.gift_date, today));
              return d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`;
            })()}
          </span>
        </>
      ),
    },
    {
      key: "contact",
      header: "Thank by",
      className: "text-ink-2",
      render: (r) => (
        <>
          <span className="block truncate max-w-[220px]">{r.email ?? "No email on file"}</span>
          {r.constituent?.preferred_ack_channel ? (
            <span className="block text-xs">Prefers {CHANNEL_LABEL[r.constituent.preferred_ack_channel]?.toLowerCase() ?? r.constituent.preferred_ack_channel}</span>
          ) : null}
        </>
      ),
    },
    {
      key: "receipt",
      header: "Receipt",
      className: "text-ink-2",
      render: (r) =>
        requiresSubstantiation(r.amount) ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-status-critical-bg text-status-critical-text">Required</span>
        ) : (
          <span className="text-xs">Not required</span>
        ),
    },
  ];

  return (
    <div className="max-w-workspace px-4 lg:px-8 py-6 lg:py-8">
      <PageHeader
        title="Thank-yous"
        subtitle="Gifts waiting for a thank-you, oldest first. The receipt language is generated, never edited."
        secondaryActions={
          <span className="flex flex-wrap items-center gap-3">
            <LogAckButton />
            <ThankathonButton count={pending.length} />
          </span>
        }
        moreActions={[
          { label: "Print letters", href: "/admin/fundraising/acknowledgments/letters" },
          { label: "Thank-you templates", href: "/admin/fundraising/acknowledgments/templates" },
        ]}
        primaryAction={<RecordGiftButton />}
      />

      <SavedViews
        label="Thank-you views"
        activeKey={view}
        views={THANK_VIEWS.map((v) => ({
          key: v.key,
          label: v.label,
          count: viewCount(v.key),
          href: v.key === "all" ? BASE : `${BASE}?view=${v.key}`,
        }))}
      />

      <SummaryStrip label="Thank-you summary">
        <Figure
          label="Waiting for thanks"
          value={sum.count}
          compare={sum.count > 0 ? usd(sum.total) : undefined}
          source="Gifts marked thank-you pending, as of now"
        />
        <Figure
          label={`Written receipt required ($${IRS_SUBSTANTIATION_THRESHOLD} and up)`}
          value={sum.receiptCount}
          source="IRS rule for a single gift, from each gift's amount"
        />
        <Figure
          label="Oldest waiting"
          value={sum.oldestDays === null ? null : `${sum.oldestDays} day${sum.oldestDays === 1 ? "" : "s"}`}
          compareTone={sum.oldestDays !== null && sum.oldestDays > 2 ? "danger" : "muted"}
          source={sum.oldestDate ? `Gift on ${shortDay(sum.oldestDate, today)}` : "Shows when a gift is waiting"}
        />
      </SummaryStrip>

      <DataTable
        label="Gifts waiting for a thank-you"
        noun={{ one: "gift", many: "gifts" }}
        columns={columns}
        nextStep={{
          header: "Next step",
          render: (r) => (
            <span className="flex flex-wrap items-center gap-2">
              <ThankYouButton
                mode={nextStepFor({ email: r.email, preferred: r.constituent?.preferred_ack_channel })}
                giftId={r.id}
                donorName={r.donor === "Anonymous" ? "there" : r.donor}
                donorEmail={r.email}
                complianceBlock={previewBlock(receiptOf(r))}
                templates={templates}
                defaultChannel={(r.constituent?.preferred_ack_channel as AckChannel | null) ?? null}
                orgName={ctx?.orgName ?? "our organization"}
                giftLine={`${usd(r.amount)} gift on ${shortDay(r.gift_date, today)}${r.email ? `. To ${r.email}` : ". No email on file"}`}
              />
              <ReviewGiftButton giftId={r.id} />
            </span>
          ),
        }}
        data={{ rows, total: inView.length, page: state.page, pageSize: THANK_TABLE.pageSize }}
        getRowId={(r) => r.id}
        getRowLabel={(r) => `${r.donor}, ${usd(r.amount)}`}
        spec={THANK_TABLE}
        state={state}
        baseHref={BASE}
        filters={filters}
        bulkActions={[
          {
            kind: "request",
            key: "mark",
            label: "Mark thanked",
            url: "/api/admin/acknowledgments/mark/bulk",
            confirm: "Mark these gifts thanked?",
            confirmBody: "Each is recorded as thanked outside BloomOS and leaves this list. No email is sent.",
            success: "Marked thanked",
          },
        ]}
        empty={
          all.length === 0 ? (
            <EmptyState
              label="thank-yous waiting"
              hint="Every gift has been thanked. New gifts land here when your thank-you rules ask for a personal touch."
            />
          ) : undefined
        }
        emptyMessage="No gifts in this view."
      />

      <p className="text-xs text-ink-2 leading-relaxed max-w-2xl mt-4">
        Each pending thank-you is also a task on the Ops queue and the Right Rail, linked to the donor. The receipt
        language (gift amount, date, the no-goods-or-services statement, and the quid-pro-quo split when a fair market
        value is recorded) is generated from the gift record and appended to every email automatically. It is never
        AI-written and never editable. AI drafts only the personal note, and nothing sends without your review. Mark
        thanked never sends anything.
      </p>
    </div>
  );
}
