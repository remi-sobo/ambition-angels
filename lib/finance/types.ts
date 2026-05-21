// Shared types for the finance domain. Kept narrow on purpose — anything
// route- or page-specific lives next to its caller.

export type BankFormat =
  | "wells-fargo"
  | "chase"
  | "mercury"
  | "quickbooks"
  | "generic";

export type FunctionalClass = "program" | "admin" | "fundraising";
export type CategoryKind = "expense" | "revenue" | "transfer";

export type FinCategory = {
  id: string;
  group_name: string;
  display_name: string;
  kind: CategoryKind;
  functional_class: FunctionalClass | null;
  sort_order: number;
  enabled: boolean;
};

// A row produced by a CSV parser. Pre-dedup, pre-categorization.
export type ParsedTxn = {
  txn_date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positive = inflow, negative = outflow
};

// After dedup and category-rule pass, this is what gets shown in preview and
// inserted into fin_transactions on commit.
export type StagedTxn = ParsedTxn & {
  dedup_hash: string;
  category_id: string | null;
  matched_rule_id: string | null;
  is_duplicate: boolean; // already present in DB (by dedup_hash)
};

export type ImportPreview = {
  bank_format: BankFormat;
  filename: string;
  file_hash: string;
  file_already_imported: boolean; // file_hash matched an existing fin_imports row
  row_count: number;
  new_count: number;
  duplicate_count: number;
  categorized_count: number;
  inflow_total: number;
  outflow_total: number;
  period_start: string | null;
  period_end: string | null;
  rows: StagedTxn[];
};
