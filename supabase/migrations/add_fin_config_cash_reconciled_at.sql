-- Reconciliation timestamp for the cash anchor.
--
-- "Set current balance" (Finance → reconcile) records when the user last
-- confirmed the real bank balance, so every finance surface can show how fresh
-- the cash figure is ("Reconciled 3d ago" / "Never reconciled"). Nullable,
-- backward compatible. Idempotent.

alter table public.fin_config add column if not exists cash_reconciled_at timestamptz;
