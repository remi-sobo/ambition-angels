import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  diffGift,
  giftDefaults,
  lockedFields,
  lockedViolations,
  normalizeGiftPatch,
  parseAmount,
  receiptEditNotice,
  receiptWasSent,
} from "@/lib/fundraising/giftEdit";

// V4 Stage B1: gifts become editable from the donor timeline. These lock in
// the edit rules (lib/fundraising/giftEdit.ts) and the guards on the routes
// and the drawer that use them.

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const manual = {
  amount: 250,
  gift_date: "2026-10-03",
  method: "check",
  fund_id: null,
  campaign_id: null,
  appeal_id: null,
  fair_market_value: null,
  deductible_amount: null,
  notes: null,
};

describe("normalizeGiftPatch", () => {
  test("keeps only valid editable fields", () => {
    const p = normalizeGiftPatch(
      { amount: 300, gift_date: "2026-10-04", method: "card", constituent_id: "x", acknowledgment_status: "sent", external_source: "manual" },
      250,
    );
    expect(p).toEqual({ amount: 300, gift_date: "2026-10-04", method: "card" });
  });

  test("drops a zero, negative or non-numeric amount and a bad date or method", () => {
    expect(normalizeGiftPatch({ amount: 0, gift_date: "Oct 4", method: "venmo" }, 250)).toEqual({});
    expect(normalizeGiftPatch({ amount: -5 }, 250)).toEqual({});
    expect(normalizeGiftPatch({ amount: "300" }, 250)).toEqual({});
  });

  test("fair market value sets the deductible part from the new or current amount", () => {
    expect(normalizeGiftPatch({ fair_market_value: 100 }, 250)).toMatchObject({ fair_market_value: 100, deductible_amount: 150 });
    expect(normalizeGiftPatch({ amount: 500, fair_market_value: 100 }, 250)).toMatchObject({ deductible_amount: 400 });
    expect(normalizeGiftPatch({ fair_market_value: 400 }, 250)).toMatchObject({ deductible_amount: 0 });
    expect(normalizeGiftPatch({ fair_market_value: null }, 250)).toMatchObject({ fair_market_value: null, deductible_amount: null });
  });

  test("clearing an attribution sends null", () => {
    expect(normalizeGiftPatch({ fund_id: "" }, 250)).toEqual({ fund_id: null });
  });
});

describe("diffGift", () => {
  test("reports only the fields that change, with before and after", () => {
    const d = diffGift(manual, { amount: 300, method: "check", notes: null });
    expect(d.changed).toEqual(["amount"]);
    expect(d.before).toEqual({ amount: 250 });
    expect(d.after).toEqual({ amount: 300 });
  });

  test("numeric strings from the database compare equal to numbers", () => {
    expect(diffGift({ ...manual, amount: "250.00" as unknown as number }, { amount: 250 }).changed).toEqual([]);
  });

  test("empty string and null are the same value", () => {
    expect(diffGift({ ...manual, notes: "" }, { notes: null }).changed).toEqual([]);
  });

  test("an unchanged re-send never clears a synced gift's deductible amount", () => {
    const stripe = { ...manual, deductible_amount: 250 };
    const patch = normalizeGiftPatch({ notes: "Matched by employer", fair_market_value: null }, 250);
    const d = diffGift(stripe, patch);
    expect(d.changed).toEqual(["notes"]);
    expect("deductible_amount" in d.after).toBe(false);
  });

  test("a new fair market value moves the deductible part in the audit", () => {
    const d = diffGift(manual, normalizeGiftPatch({ fair_market_value: 50 }, 250));
    expect(d.changed).toEqual(["fair_market_value"]);
    expect(d.after).toEqual({ fair_market_value: 50, deductible_amount: 200 });
    expect(d.before).toEqual({ fair_market_value: null, deductible_amount: null });
  });
});

describe("locked fields for synced gifts", () => {
  test("Stripe, Givebutter and HubSpot gifts keep amount, date and method", () => {
    for (const s of ["stripe", "givebutter", "hubspot_deal"]) expect(lockedFields(s)).toEqual(["amount", "gift_date", "method"]);
    expect(lockedFields("manual")).toEqual([]);
    expect(lockedFields(null)).toEqual([]);
  });

  test("violations name only the locked fields an edit touches", () => {
    expect(lockedViolations("stripe", ["amount", "notes"])).toEqual(["amount"]);
    expect(lockedViolations("stripe", ["fund_id", "notes"])).toEqual([]);
    expect(lockedViolations("manual", ["amount"])).toEqual([]);
  });
});

describe("receipt already sent", () => {
  test("a sent receipt template or a letter counts; a logged call does not", () => {
    expect(receiptWasSent([{ template: "receipt-v1", channel: "email", sent_at: "2026-10-05T10:00:00Z" }])).toBe(true);
    expect(receiptWasSent([{ template: "auto-receipt", channel: "email", sent_at: "2026-10-05T10:00:00Z" }])).toBe(true);
    expect(receiptWasSent([{ template: "manual", channel: "letter", sent_at: "2026-10-05T10:00:00Z" }])).toBe(true);
    expect(receiptWasSent([{ template: "manual", channel: "call", sent_at: "2026-10-05T10:00:00Z" }])).toBe(false);
    expect(receiptWasSent([{ template: "receipt-v1", channel: "email", sent_at: null }])).toBe(false);
    expect(receiptWasSent([])).toBe(false);
  });

  test("the notice: none without a receipt, warning when the edit changes what it says, info otherwise", () => {
    expect(receiptEditNotice(false, ["amount"])).toBeNull();
    expect(receiptEditNotice(true, ["amount"])?.tone).toBe("warning");
    expect(receiptEditNotice(true, ["fair_market_value"])?.tone).toBe("warning");
    expect(receiptEditNotice(true, ["notes"])?.tone).toBe("info");
    expect(receiptEditNotice(true, [])?.tone).toBe("info");
    expect(receiptEditNotice(true, ["amount"])?.body).toMatch(/nothing is resent/i);
  });
});

describe("smart defaults and amount parsing", () => {
  test("date is the org's today; method follows the last gift, else check", () => {
    expect(giftDefaults({ today: "2026-11-21", lastMethod: "card" })).toEqual({
      gift_date: "2026-11-21",
      method: "card",
      methodHint: "Card, like the last gift",
    });
    expect(giftDefaults({ today: "2026-11-21", lastMethod: null })).toMatchObject({ method: "check", methodHint: null });
    expect(giftDefaults({ today: "2026-11-21", lastMethod: "venmo" })).toMatchObject({ method: "check" });
  });

  test("parseAmount reads what people type", () => {
    expect(parseAmount("25,000")).toBe(25000);
    expect(parseAmount("$1,250.50")).toBe(1250.5);
    expect(parseAmount(" 40 ")).toBe(40);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("source guards", () => {
  const route = strip(read("app/api/admin/gifts/[id]/route.ts"));
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));

  test("the edit route checks fundraising.write before anything else", () => {
    const guard = patch.indexOf('requirePermission("fundraising.write")');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(patch.indexOf("createServerSupabase("));
  });

  test("the edit route reads the before, is org-pinned, and audits before and after", () => {
    expect(patch).toMatch(/\.eq\("org_id", ctx\.orgId\)/);
    expect(patch).toMatch(/audit\(req, \{[\s\S]*action: "fundraising\.gift\.update"[\s\S]*before: diff\.before[\s\S]*after:/);
    expect(patch).toMatch(/lockedViolations\(/);
  });

  test("the edit route never sends or resends a thank-you or receipt", () => {
    expect(patch).not.toMatch(/transport|sendEmail|acknowledgments\/send|buildReceiptEmail|processGiftStewardship/);
  });

  test("recording a gift checks fundraising.write", () => {
    expect(strip(read("app/api/admin/gifts/route.ts"))).toMatch(/requirePermission\("fundraising\.write"\)/);
  });

  test("the gift drawer never updates money optimistically", () => {
    const drawer = strip(read("app/admin/fundraising/_components/gift/GiftDrawer.tsx"));
    expect(drawer).toMatch(/save[<(]/);
    expect(drawer).not.toMatch(/optimistic\s*:/);
    // and it has no delete
    expect(drawer).not.toMatch(/method: "DELETE"/);
  });

  test("the gift drawer never sends an email itself", () => {
    const drawer = strip(read("app/admin/fundraising/_components/gift/GiftDrawer.tsx"));
    expect(drawer).not.toMatch(/acknowledgments\/send/);
  });

  test("bulk mark thanked is guarded and never sends", () => {
    const bulk = strip(read("app/api/admin/acknowledgments/mark/bulk/route.ts"));
    expect(bulk).toMatch(/requirePermission\("fundraising\.write"\)/);
    expect(bulk + strip(read("lib/fundraising/ack-mark.ts"))).not.toMatch(/transport|buildReceiptEmail|\.send\(/);
  });
});
