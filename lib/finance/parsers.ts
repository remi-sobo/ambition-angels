import type { BankFormat, ParsedTxn } from "./types";

// ── CSV row tokenizer ──────────────────────────────────────────────────────
// Hand-rolled because we don't need (and don't want to ship) a full CSV
// library — bank exports are well-behaved RFC-4180-ish: comma separator,
// double-quote string wrap, double-quote escape via "". No multi-line cells
// in any of the formats we support.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let cur = "";
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
        i++;
        continue;
      }
      if (ch === '"' && cur.length === 0) {
        inQuotes = true;
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
  }
  out.push(cur);
  return out;
}

function splitLines(text: string): string[] {
  // Strip BOM (Wells Fargo and Excel exports often include one), split on any
  // line ending, drop empty trailing lines.
  const cleaned = text.replace(/^﻿/, "");
  return cleaned.split(/\r?\n/).filter((l) => l.length > 0);
}

function toIsoDate(input: string): string | null {
  // Accept MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD. Wells Fargo uses MM/DD/YYYY.
  const trimmed = input.trim();
  let m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return trimmed;
  return null;
}

function parseAmount(input: string): number | null {
  // Strip currency symbol, thousands commas, surrounding whitespace. Accept
  // parenthesized negatives — QuickBooks exports use them.
  const trimmed = input.trim().replace(/[$\s]/g, "");
  if (trimmed === "") return null;
  const paren = trimmed.match(/^\((.+)\)$/);
  const core = paren ? paren[1] : trimmed;
  const cleaned = core.replace(/,/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return paren ? -Math.abs(n) : n;
}

// ── Wells Fargo CSV ────────────────────────────────────────────────────────
// Wells Fargo's consumer/business export has NO header row and five columns:
//   1. Date          MM/DD/YYYY
//   2. Amount        signed; negative = debit (money out), positive = credit
//   3. Star marker   always "*" (legacy)
//   4. Check number  usually empty
//   5. Description   may contain commas; always quoted in WF exports
// This matches our internal sign convention (positive = inflow), so amounts
// pass through unchanged.
function parseWellsFargo(text: string): ParsedTxn[] {
  const rows: ParsedTxn[] = [];
  for (const raw of splitLines(text)) {
    const cells = parseCsvLine(raw);
    if (cells.length < 5) continue;
    const date = toIsoDate(cells[0]);
    const amt = parseAmount(cells[1]);
    const desc = cells[4]?.trim() ?? "";
    if (!date || amt === null || desc === "") continue;
    rows.push({ txn_date: date, description: desc, amount: amt });
  }
  return rows;
}

// ── Generic CSV (header-driven) ────────────────────────────────────────────
// Fallback for any bank not yet adapter'd. Requires headers; recognizes any
// of: date | description | amount  (also accepts "credit"/"debit" pair).
function parseGeneric(text: string): ParsedTxn[] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxOf = (...names: string[]) =>
    headers.findIndex((h) => names.includes(h));

  const dateIdx = idxOf("date", "transaction date", "posted date", "post date");
  const descIdx = idxOf("description", "memo", "details", "name", "payee");
  const amountIdx = idxOf("amount");
  const debitIdx = idxOf("debit", "withdrawal");
  const creditIdx = idxOf("credit", "deposit");

  if (dateIdx < 0 || descIdx < 0) {
    throw new Error(
      `Generic CSV requires "date" and "description" columns. Got headers: ${headers.join(", ")}`
    );
  }
  if (amountIdx < 0 && (debitIdx < 0 || creditIdx < 0)) {
    throw new Error(
      `Generic CSV requires "amount" or a debit/credit pair. Got headers: ${headers.join(", ")}`
    );
  }

  const rows: ParsedTxn[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const date = toIsoDate(cells[dateIdx] ?? "");
    const desc = (cells[descIdx] ?? "").trim();
    if (!date || !desc) continue;

    let amount: number | null = null;
    if (amountIdx >= 0) {
      amount = parseAmount(cells[amountIdx] ?? "");
    } else {
      const debit = parseAmount(cells[debitIdx] ?? "") ?? 0;
      const credit = parseAmount(cells[creditIdx] ?? "") ?? 0;
      amount = credit - debit;
    }
    if (amount === null || amount === 0) continue;
    rows.push({ txn_date: date, description: desc, amount });
  }
  return rows;
}

// ── Public entry point ─────────────────────────────────────────────────────
export function parseCsv(text: string, format: BankFormat): ParsedTxn[] {
  switch (format) {
    case "wells-fargo":
      return parseWellsFargo(text);
    case "generic":
      // Until Chase/Mercury/QuickBooks adapters are written, route those
      // through the header-driven parser. They'll likely work — most bank
      // exports have a date/description/amount column set.
      return parseGeneric(text);
    case "chase":
    case "mercury":
    case "quickbooks":
      return parseGeneric(text);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unsupported bank format: ${String(_exhaustive)}`);
    }
  }
}

export const __test__ = { parseCsvLine, parseAmount, toIsoDate };
