import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import { audit } from "@/lib/audit";
import { loadStewardshipRules, decideImportStatus, ageInDays } from "@/lib/fundraising/stewardship";
import { toIsoDate } from "@/lib/admin/imports/engine";
import {
  normalizeGiftMethod,
  giftDedupeKey,
  emptyReconciliation,
  addToReconciliation,
} from "@/lib/fundraising/import-gifts";

// Epic M2 — commit a mapped CSV import. Rows arrive already mapped to known
// fields (the client wizard does column mapping). Dedupe is by email in a
// single pass: an existing email matches its constituent (fields not
// overwritten — no clobber); otherwise a constituent is created. An optional
// per-row gift (amount + date) lands on the spine, tagged external_source
// 'import'.
//
// Idempotent for gifts too: a gift matching an already-imported
// (constituent, date, amount) is skipped, so re-running the same file (or an
// overlapping export) never doubles the spine. The response carries a per-year
// reconciliation report so imported totals can be checked against the source
// system's prior-year numbers.

const CAP = 5000;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Row = {
  first_name?: unknown; last_name?: unknown; org_name?: unknown; type?: unknown;
  email?: unknown; phone?: unknown; tags?: unknown;
  amount?: unknown; gift_date?: unknown; method?: unknown;
};

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { rows?: Row[] } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : null;
  if (!rows) return NextResponse.json({ error: "rows[] is required" }, { status: 400 });
  if (rows.length > CAP) return NextResponse.json({ error: `Too many rows (${rows.length}); cap is ${CAP}. Split the file.` }, { status: 400 });

  const supabase = createServerSupabase();

  // The matrix governs imported gifts too — loaded once for the whole batch.
  // Historical (old-dated) rows age out of every rule and land 'not_required';
  // a recent row that would need a human lands 'pending' for the queue. No
  // bulk emails or tasks are sent from import (that would bury the queue).
  const stewardshipRules = await loadStewardshipRules(supabase, ctx.orgId);

  // One pass to build an email → constituent-id map for dedupe (case-insensitive).
  const emailToId = new Map<string, string>();
  const { data: existing } = await supabase.from("constituents").select("id, emails").limit(50000);
  for (const c of (existing ?? []) as Array<{ id: string; emails: string[] | null }>) {
    for (const e of c.emails ?? []) {
      const k = e.trim().toLowerCase();
      if (k && !emailToId.has(k)) emailToId.set(k, c.id);
    }
  }

  // Already-imported gifts, keyed (constituent, date, amount) — the gift-level
  // idempotency ledger. Grown in-loop so a duplicate within the same file is
  // caught too.
  const seenGifts = new Set<string>();
  const { data: priorGifts } = await supabase
    .from("gifts")
    .select("constituent_id, gift_date, amount")
    .eq("external_source", "import")
    .limit(50000);
  for (const g of (priorGifts ?? []) as Array<{ constituent_id: string | null; gift_date: string; amount: number }>) {
    if (g.constituent_id) seenGifts.add(giftDedupeKey(g.constituent_id, g.gift_date, Number(g.amount)));
  }

  let created = 0;
  let matched = 0;
  let gifts = 0;
  let skipped = 0;
  const reconciliation = emptyReconciliation();
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = str(r.email).toLowerCase();
    const first = str(r.first_name);
    const last = str(r.last_name);
    const org = str(r.org_name);
    if (!email && !first && !last && !org) { skipped++; continue; }

    let constituentId: string | null = email ? emailToId.get(email) ?? null : null;

    if (constituentId) {
      matched++;
    } else {
      const type = org || str(r.type) === "organization" ? "organization" : "person";
      // Stamp org_id from session — never ride the AA column default (org_id trap).
      const insert: Record<string, unknown> = { org_id: ctx.orgId, type, source: "import" };
      if (type === "organization") insert.org_name = org || `${first} ${last}`.trim();
      else { if (first) insert.first_name = first; if (last) insert.last_name = last; }
      if (email) insert.emails = [email];
      const phone = str(r.phone);
      if (phone) insert.phones = [phone];
      const tags = str(r.tags);
      if (tags) insert.tags = tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean);

      const { data: c, error } = await supabase.from("constituents").insert(insert).select("id").single();
      if (error || !c) { errors.push(`Row ${i + 1}: ${error?.message ?? "create failed"}`); skipped++; continue; }
      constituentId = c.id;
      if (email) emailToId.set(email, c.id); // dedupe within the same file too
      created++;
    }

    // Optional gift on the row. Dates accept YYYY-MM-DD or M/D/YYYY (the shape
    // CRM exports like Network for Good and Excel produce).
    const amount = typeof r.amount === "number" ? r.amount : parseFloat(str(r.amount).replace(/[$,]/g, ""));
    if (amount > 0 && constituentId) {
      const giftDate = toIsoDate(str(r.gift_date));
      if (!isDate(giftDate)) { errors.push(`Row ${i + 1}: gift skipped (needs a date, YYYY-MM-DD or M/D/YYYY)`); continue; }
      const method = normalizeGiftMethod(str(r.method));
      const giftAmount = Math.round(amount * 100) / 100;

      // Idempotency: an identical (constituent, date, amount) was already
      // imported — in a prior run or earlier in this file. Skip, and report.
      const key = giftDedupeKey(constituentId, giftDate, giftAmount);
      if (seenGifts.has(key)) {
        addToReconciliation(reconciliation, giftDate, giftAmount, "duplicate");
        continue;
      }

      const ackStatus = decideImportStatus(
        {
          amount: giftAmount,
          method,
          gift_date: giftDate,
          external_source: "import",
          recurring: false,
          ageDays: ageInDays(giftDate),
        },
        stewardshipRules
      );
      const { error: gErr } = await supabase.from("gifts").insert({
        org_id: ctx.orgId,
        constituent_id: constituentId,
        amount: giftAmount,
        gift_date: giftDate,
        method,
        external_source: "import",
        acknowledgment_status: ackStatus,
      });
      if (gErr) errors.push(`Row ${i + 1}: gift failed (${gErr.message})`);
      else {
        gifts++;
        seenGifts.add(key);
        addToReconciliation(reconciliation, giftDate, giftAmount, "inserted");
      }
    }
  }

  await audit(req, {
    action: "fundraising.import.commit",
    entityType: "constituents",
    after: {
      rows: rows.length, created, matched, gifts, skipped,
      gift_duplicates: reconciliation.duplicates, errors: errors.length,
    },
  });

  return NextResponse.json({
    ok: true, created, matched, gifts, skipped,
    gift_duplicates: reconciliation.duplicates,
    reconciliation,
    errors: errors.slice(0, 50),
  });
}
