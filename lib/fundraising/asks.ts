// The Ask Log — shared vocabulary, validation, and rollups.
//
// Pure module (no React / Next / Supabase imports) so it's usable from server
// pages, client controls, API route validation, and unit tests alike. The DB
// check constraints in create_asks_log.sql are the source of truth; these
// arrays mirror them and must be kept in sync.

export const ASK_FORMS = [
  ["grant_proposal", "Grant proposal"],
  ["loi", "Letter of inquiry"],
  ["major_gift", "Major gift ask"],
  ["corporate_sponsorship", "Corporate sponsorship"],
  ["event_sponsorship", "Event sponsorship"],
  ["in_kind", "In-kind"],
  ["appeal", "Appeal"],
  ["verbal", "Verbal ask"],
  ["email", "Email"],
  ["letter", "Letter"],
  ["other", "Other"],
] as const;

export type AskForm = (typeof ASK_FORMS)[number][0];
export const ASK_FORM_VALUES = ASK_FORMS.map(([v]) => v) as readonly AskForm[];

export const ASK_STATUSES = [
  ["draft", "Draft"],
  ["submitted", "Submitted"],
  ["pending", "Pending decision"],
  ["awarded", "Awarded"],
  ["partial", "Partially awarded"],
  ["declined", "Declined"],
  ["withdrawn", "Withdrawn"],
] as const;

export type AskStatus = (typeof ASK_STATUSES)[number][0];
export const ASK_STATUS_VALUES = ASK_STATUSES.map(([v]) => v) as readonly AskStatus[];

export const ASK_FORM_LABELS: Record<string, string> = Object.fromEntries(ASK_FORMS);
export const ASK_STATUS_LABELS: Record<string, string> = Object.fromEntries(ASK_STATUSES);

// Open = still in flight (counts toward outstanding ask $). Decided = the
// funder has answered. Won = money on the table. Lost = closed with no money.
export const OPEN_ASK_STATUSES: readonly AskStatus[] = ["draft", "submitted", "pending"];
export const WON_ASK_STATUSES: readonly AskStatus[] = ["awarded", "partial"];
export const DECIDED_ASK_STATUSES: readonly AskStatus[] = ["awarded", "partial", "declined", "withdrawn"];

export const isAskForm = (v: unknown): v is AskForm =>
  typeof v === "string" && (ASK_FORM_VALUES as readonly string[]).includes(v);
export const isAskStatus = (v: unknown): v is AskStatus =>
  typeof v === "string" && (ASK_STATUS_VALUES as readonly string[]).includes(v);

// Which chip color a status gets in the UI (BloomOS finance palette).
export const askStatusTone = (status: string): "open" | "won" | "lost" | "neutral" => {
  if ((OPEN_ASK_STATUSES as readonly string[]).includes(status)) return "open";
  if ((WON_ASK_STATUSES as readonly string[]).includes(status)) return "won";
  if (status === "declined" || status === "withdrawn") return "lost";
  return "neutral";
};

// ── Document upload guardrails ──────────────────────────────────────────────
// The point of the log is the ask document — a PDF, almost always. We accept
// PDFs plus the common office/image formats a proposal packet arrives in.
export const MAX_ASK_DOC_BYTES = 25 * 1024 * 1024; // 25 MB

export const ASK_DOC_EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const isAllowedAskDocMime = (mime: string): boolean =>
  Object.prototype.hasOwnProperty.call(ASK_DOC_EXT_BY_MIME, mime);

// ── Rollups ─────────────────────────────────────────────────────────────────

export type AskForStats = {
  status: string;
  amount_requested: number | null;
  amount_committed: number | null;
};

export type AskStats = {
  total: number;
  openCount: number;
  /** Sum of amount_requested across open asks (what's still out there). */
  outstanding: number;
  /** Sum of amount_committed across won asks. */
  committed: number;
  decidedCount: number;
  wonCount: number;
  /** won / decided, in [0,1]; null when nothing has been decided yet. */
  winRate: number | null;
};

export function computeAskStats(asks: readonly AskForStats[]): AskStats {
  let openCount = 0;
  let outstanding = 0;
  let committed = 0;
  let decidedCount = 0;
  let wonCount = 0;

  for (const a of asks) {
    const open = (OPEN_ASK_STATUSES as readonly string[]).includes(a.status);
    const won = (WON_ASK_STATUSES as readonly string[]).includes(a.status);
    const decided = (DECIDED_ASK_STATUSES as readonly string[]).includes(a.status);
    if (open) {
      openCount += 1;
      outstanding += a.amount_requested ?? 0;
    }
    if (won) {
      wonCount += 1;
      committed += a.amount_committed ?? 0;
    }
    if (decided) decidedCount += 1;
  }

  return {
    total: asks.length,
    openCount,
    outstanding,
    committed,
    decidedCount,
    wonCount,
    winRate: decidedCount === 0 ? null : wonCount / decidedCount,
  };
}
