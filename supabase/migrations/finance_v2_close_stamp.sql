-- Finance v2 (Phase 5): Friday close stamp.
--
-- last_reconciled_at marks when the full reconciliation ritual (import →
-- categorize → pledges → balance → baseline → review) was last completed, as
-- distinct from cash_reconciled_at, which only marks when the bank balance was
-- last set. Surfaces show "reconciled as of <date>" from this.
--
-- Cheapest option for D3 (a single timestamp, mirroring cash_reconciled_at) —
-- no new table, no new RLS surface. If a board history trail is wanted later, a
-- fin_reconciliation_runs log table can be added (the name fin_reconciliation_items
-- is already taken by the Cowork inbox). Additive, nullable, reversible.

alter table public.fin_config
  add column if not exists last_reconciled_at timestamptz null;

comment on column public.fin_config.last_reconciled_at is
  'When the full Friday reconciliation ritual was last completed (distinct from cash_reconciled_at, which is just the last balance set).';
