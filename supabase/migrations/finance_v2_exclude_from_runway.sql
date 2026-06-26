-- Finance v2 (Phase 4a): per-transaction exclude-from-runway flag.
--
-- Lets Shannon mark a transaction as not representative of recurring burn (a
-- one-off capital purchase, a pass-through, a reimbursement) so it drops out of
-- month-to-date spend and the trailing-burn baseline — and therefore out of the
-- runway — without deleting it or distorting the ledger, the cash-flow chart, or
-- YTD totals, which still count every real dollar.
--
-- Additive, NOT NULL with a false default, so every existing row is "included"
-- exactly as today. Reversible with `alter table ... drop column`. Inherits
-- org_id from the table.

alter table public.fin_transactions
  add column if not exists exclude_from_runway boolean not null default false;

comment on column public.fin_transactions.exclude_from_runway is
  'When true, this transaction is left out of month-to-date spend and the burn baseline (and thus the runway). It still counts in YTD totals and the cash-flow chart.';
