-- Fundraising Phase 2 / Epic G: recurring-plan health.
--
-- Two timestamps so the recurring dashboard can show last successful charge and
-- surface a failed-payment flag (set from the Stripe invoice webhooks).
-- Additive + idempotent.

alter table recurring_plans
  add column if not exists last_charged_at timestamptz;
alter table recurring_plans
  add column if not exists last_payment_failed_at timestamptz;
