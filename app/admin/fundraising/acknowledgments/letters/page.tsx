import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { constituentName } from "@/lib/fundraising/display";
import { complianceBlock, requiresSubstantiation, type ReceiptGift } from "@/lib/fundraising/receipt";
import PrintButton from "../_components/PrintButton";
import { TYPE } from "@/lib/admin/typeScale";

// Print-ready batch of letter thank-yous: every pending gift that needs a
// written receipt, laid out one letter per page. Print to PDF from the browser
// (no PDF dependency). The compliance block is generated from the gift, never
// edited. A per-donor letter channel preference is honored upstream; this view
// is the bulk fallback for mailed receipts.
export const dynamic = "force-dynamic";

const letterBody = (org: string) =>
  `Thank you for your generous gift to ${org}. Your support directly funds the students and programs at the heart of our mission, and we are grateful to have you with us.`;

const longDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

type LetterGift = {
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
    street: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null;
};

export default async function BatchLettersPage() {
  const supabase = createServerSupabase();
  const ctx = await getOrgContext();
  if (!ctx) notFound();
  // Org name from the orgs row, never hardcoded (shared-host rule). The
  // letterhead address/EIN below are still resident-org literals — they move
  // to org settings when a second tenant needs letters.
  const orgName = ctx.orgName;
  const { data } = await supabase
    .from("gifts")
    .select(
      "id, amount, gift_date, method, fair_market_value, deductible_amount, constituent:constituents(type, first_name, last_name, org_name, street, city, state, postal_code)"
    )
    .eq("org_id", ctx.orgId)
    .eq("acknowledgment_status", "pending")
    .order("gift_date", { ascending: true })
    .limit(200);

  const letters = ((data ?? []) as unknown as LetterGift[])
    .map((g) => ({ ...g, amount: Number(g.amount) }))
    .filter((g) => requiresSubstantiation(g.amount));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a]">
      <div className="bg-tile border-b border-outline px-4 lg:px-8 py-3 flex items-center gap-3 print:hidden">
        <Link href="/admin/fundraising/acknowledgments" className="text-xs font-semibold text-ink-2 hover:text-ink-1">
          ← Acknowledgments
        </Link>
        <span className={TYPE.cardTitle}>Receipt letters ({letters.length})</span>
        <span className="ml-auto">
          <PrintButton label="Print letters" />
        </span>
      </div>

      {letters.length === 0 ? (
        <p className="max-w-[680px] mx-auto px-8 py-16 text-[#555] text-sm">
          No receipt-required thank-yous are waiting. Letters appear here for pending gifts that need a written receipt.
        </p>
      ) : (
        letters.map((g) => {
          const c = g.constituent;
          const name = c ? constituentName(c) : "Friend";
          const first = c?.type === "organization" ? name : c?.first_name || name;
          const receiptGift: ReceiptGift = {
            amount: g.amount,
            gift_date: g.gift_date,
            method: g.method,
            fair_market_value: g.fair_market_value === null ? null : Number(g.fair_market_value),
            deductible_amount: g.deductible_amount === null ? null : Number(g.deductible_amount),
          };
          const addr = [c?.street, [c?.city, c?.state].filter(Boolean).join(", "), c?.postal_code]
            .filter(Boolean)
            .join("\n");
          return (
            <article
              key={g.id}
              className="max-w-[680px] mx-auto px-10 py-12 break-after-page"
              style={{ fontFamily: "Georgia, serif", lineHeight: 1.7 }}
            >
              <div className="font-bold text-lg">{orgName}</div>
              <div className="text-xs text-[#666] mb-8">380 Portage Ave, Palo Alto, CA 94306 · EIN 87-2513010</div>
              <div className="text-sm mb-6">{longDate(today)}</div>
              <div className="text-sm whitespace-pre-line mb-6">
                {name}
                {addr ? `\n${addr}` : ""}
              </div>
              <p className="text-sm mb-4">Dear {first},</p>
              <p className="text-sm mb-6">{letterBody(orgName)}</p>
              <p className="text-sm mb-6">With gratitude,<br />The {orgName} team</p>
              <hr className="border-0 border-t border-[#ddd] my-6" />
              <pre className="text-xs text-[#444] whitespace-pre-wrap" style={{ fontFamily: "Georgia, serif" }}>
                {complianceBlock(receiptGift)}
              </pre>
            </article>
          );
        })
      )}
    </div>
  );
}
