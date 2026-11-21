// IRS Pub 1771 acknowledgment language, built ONLY from gift fields.
// This module is the compliance boundary: nothing here is ever
// AI-generated, and the send route rebuilds this text server-side so a
// client can't alter it (modules/03 §Donors 4).

export type ReceiptGift = {
  amount: number;
  gift_date: string; // YYYY-MM-DD
  method: string;
  fair_market_value: number | null;
  deductible_amount: number | null;
};

// IRS Pub 1771: a single gift of $250 or more requires a contemporaneous
// written acknowledgment. This statutory threshold is the one source of truth
// for "is a written receipt legally required" — views and the stewardship
// matrix derive from it rather than hardcoding the number in a page.
export const IRS_SUBSTANTIATION_THRESHOLD = 250;

export function requiresSubstantiation(amount: number): boolean {
  return amount >= IRS_SUBSTANTIATION_THRESHOLD;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const longDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

/** The sending org's identity as a receipt needs it. Comes from
 *  resolveOrgEmailIdentity (lib/email/org-identity.ts); there is no default,
 *  so one org's tax statement can never land on another org's receipt. */
export type ReceiptIdentity = {
  /** The IRS tax-status statement for the org that received the gift. */
  taxStatement: string;
  /** Plain-text footer line under the emailed receipt. */
  footerLine: string;
};

/**
 * The contemporaneous-written-acknowledgment block. Two shapes:
 * - No goods or services provided (the normal case): amount, date, and the
 *   required no-goods-or-services statement.
 * - Quid pro quo (fair_market_value recorded on the gift): the >$75
 *   disclosure with the FMV / deductible split.
 */
export function complianceBlock(gift: ReceiptGift, taxStatement: string): string {
  const lines = [
    `Gift amount: ${usd(gift.amount)}`,
    `Date received: ${longDate(gift.gift_date)}`,
    `Method: ${gift.method === "in_kind" ? "in-kind contribution" : gift.method}`,
  ];
  if (gift.fair_market_value != null && gift.fair_market_value > 0) {
    const deductible =
      gift.deductible_amount != null
        ? gift.deductible_amount
        : Math.max(gift.amount - gift.fair_market_value, 0);
    lines.push(
      `In exchange for this contribution, you received goods or services with an estimated fair market value of ${usd(gift.fair_market_value)}.`,
      `The tax-deductible portion of your contribution is limited to ${usd(deductible)} — the amount of your contribution that exceeded the value of the goods or services provided.`
    );
  } else {
    lines.push(
      "No goods or services were provided in exchange for this contribution."
    );
  }
  lines.push(taxStatement);
  return lines.join("\n");
}

/**
 * The compliance boundary for polymorphic acknowledgments: receipt language
 * exists ONLY for a real gift. A non-gift acknowledgment (a volunteer, a
 * foundation/DAF grant, a milestone) passes null and gets an empty string, so a
 * tax-deductible statement can never land on the wrong record. DAF/grant thanks
 * therefore carry no tax-deductible language, by construction.
 */
export function complianceFor(gift: ReceiptGift | null | undefined, taxStatement: string): string {
  if (!gift) return "";
  return complianceBlock(gift, taxStatement);
}

/** Full receipt email body: editable personal note above the immutable
 *  compliance block. */
export function receiptEmailText(personalNote: string, gift: ReceiptGift, identity: ReceiptIdentity): string {
  const note = personalNote.trim();
  return [note, "—".repeat(30), complianceBlock(gift, identity.taxStatement)].filter(Boolean).join("\n\n");
}

export function receiptEmailHtml(personalNote: string, gift: ReceiptGift, identity: ReceiptIdentity): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const note = esc(personalNote.trim()).replace(/\n/g, "<br/>");
  const block = esc(complianceBlock(gift, identity.taxStatement)).replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#222;max-width:560px;margin:0 auto;padding:24px;line-height:1.6">
  <p>${note}</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
  <p style="font-size:13px;color:#444">${block}</p>
  <p style="font-size:12px;color:#888;margin-top:32px">${esc(identity.footerLine)}</p>
</body></html>`;
}
