// Parser + matcher for QuickBooks Budget exports.
//
// QuickBooks exports vary by version (Online vs Desktop), report type
// (Budget Overview vs Budget by Account), and user export options (CSV vs
// XLSX-saved-as-CSV). We support two common shapes:
//
//   "Simple" — first column is the account name, last column is the annual
//             total. The CSV may have any number of intermediate monthly
//             columns; we just take the rightmost numeric column on each
//             account row.
//
//   "Headered" — there's an explicit header row containing one of
//             { Total, Annual, Year, Amount } as a column name. Account
//             names come from the first non-empty column.
//
// Header rows like "Ambition Angels Inc." / "Budget Overview" / date-range
// banners that QB Online prepends to its CSVs are skipped automatically:
// any row whose first numeric column doesn't parse is treated as non-data.
//
// Subtotal rows that QB inserts (rows whose first column starts with
// "Total ") are skipped — they'd otherwise double-count.

// ── CSV tokenizer (RFC-4180-ish, see lib/finance/parsers.ts) ───────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += ch; i++;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; i++; continue; }
      if (ch === '"' && cur.length === 0) { inQuotes = true; i++; continue; }
      cur += ch; i++;
    }
  }
  out.push(cur);
  return out;
}

function splitLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.length > 0);
}

function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/[$\s]/g, "");
  if (trimmed === "" || trimmed === "—" || trimmed === "-") return null;
  const paren = trimmed.match(/^\((.+)\)$/);
  const core = paren ? paren[1] : trimmed;
  const cleaned = core.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return paren ? -Math.abs(n) : n;
}

// Strip QB's account-number prefix and surrounding whitespace. Examples:
//   "6000 · Bank fees & service charges" → "Bank fees & service charges"
//   "6000:Bank fees & service charges"   → "Bank fees & service charges"
//   "  Bank fees & service charges  "    → "Bank fees & service charges"
function cleanAccountName(raw: string): string {
  let s = raw.trim();
  // Account-number prefix QB inserts on most reports.
  s = s.replace(/^\d+\s*[·:.\-]\s*/, "");
  return s.trim();
}

// ── Public types ──────────────────────────────────────────────────────────

export type QbBudgetRow = {
  account: string; // cleaned (no account-number prefix, trimmed)
  amount: number;  // annual total
};

export type QbParseResult = {
  rows: QbBudgetRow[];
  // Provenance for the UI banner.
  detectedFormat: "headered" | "simple";
  totalColumn: number; // index into the parsed line that we used for amount
};

// ── Parser ────────────────────────────────────────────────────────────────

const TOTAL_HEADER_RE = /^(total|annual|year|amount)$/i;
const SUBTOTAL_PREFIX_RE = /^total\s/i;

export function parseQbBudget(text: string): QbParseResult {
  const lines = splitLines(text);
  if (lines.length === 0) {
    return { rows: [], detectedFormat: "simple", totalColumn: -1 };
  }

  // Find a header row that has a "Total"-ish column.
  let headerIdx = -1;
  let totalCol = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = parseCsvLine(lines[i]).map((c) => c.trim());
    const idx = cells.findIndex((c) => TOTAL_HEADER_RE.test(c));
    if (idx >= 0) {
      headerIdx = i;
      totalCol = idx;
      break;
    }
  }

  const rows: QbBudgetRow[] = [];

  if (headerIdx >= 0) {
    // Headered format — use the identified total column.
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      if (cells.every((c) => c.trim() === "")) continue;
      const nameCell = cells.find((c) => c.trim() !== "");
      if (!nameCell) continue;
      const name = cleanAccountName(nameCell);
      if (!name || SUBTOTAL_PREFIX_RE.test(name)) continue;
      const amount = parseAmount(cells[totalCol] ?? "");
      if (amount === null) continue;
      rows.push({ account: name, amount });
    }
    return { rows, detectedFormat: "headered", totalColumn: totalCol };
  }

  // Simple fallback: assume the last numeric column on each row is the
  // annual total. Skip rows whose first non-empty cell starts with "Total ".
  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (cells.every((c) => c.trim() === "")) continue;
    const nameCell = cells.find((c) => c.trim() !== "");
    if (!nameCell) continue;
    const name = cleanAccountName(nameCell);
    if (!name || SUBTOTAL_PREFIX_RE.test(name)) continue;
    // Walk from the right to find the first parseable number.
    let amount: number | null = null;
    let amountIdx = -1;
    for (let c = cells.length - 1; c >= 0; c--) {
      const v = parseAmount(cells[c]);
      if (v !== null) {
        amount = v;
        amountIdx = c;
        break;
      }
    }
    if (amount === null || amountIdx <= 0) continue;
    rows.push({ account: name, amount });
  }
  return { rows, detectedFormat: "simple", totalColumn: -1 };
}

// ── Matcher: QB account → fin_categories.id ───────────────────────────────

export type MatchInput = {
  id: string;
  display_name: string;
  group_name: string;
  kind: "expense" | "revenue" | "transfer";
};

export type MatchResult = {
  matched: Array<QbBudgetRow & { category_id: string; current_base: number }>;
  unmatched: Array<QbBudgetRow & { suggestions: Array<{ category_id: string; display_name: string; group_name: string }> }>;
};

// Normalize for fuzzy comparison: lowercase, strip non-alphanum, collapse
// whitespace. Loses subtleties like apostrophe direction (Workers'/Workers')
// but is forgiving of casing and punctuation differences between QB and our
// display_name.
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchAccounts(
  qbRows: QbBudgetRow[],
  categories: MatchInput[],
  existingBudget: Map<string, number>
): MatchResult {
  // Only consider expense categories — revenue / transfer don't go in budget.
  const expense = categories.filter((c) => c.kind === "expense");
  const byNorm = new Map<string, MatchInput>();
  for (const c of expense) byNorm.set(norm(c.display_name), c);

  const matched: MatchResult["matched"] = [];
  const unmatched: MatchResult["unmatched"] = [];

  for (const r of qbRows) {
    const n = norm(r.account);
    const exact = byNorm.get(n);
    if (exact) {
      matched.push({
        ...r,
        category_id: exact.id,
        current_base: existingBudget.get(exact.id) ?? 0,
      });
      continue;
    }
    // Substring suggestion: any category whose normalized display_name
    // contains the QB norm, or vice versa.
    const suggestions: MatchResult["unmatched"][number]["suggestions"] = [];
    for (const c of expense) {
      const cn = norm(c.display_name);
      if (cn.includes(n) || n.includes(cn)) {
        suggestions.push({
          category_id: c.id,
          display_name: c.display_name,
          group_name: c.group_name,
        });
      }
    }
    unmatched.push({ ...r, suggestions: suggestions.slice(0, 5) });
  }

  return { matched, unmatched };
}
