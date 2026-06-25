-- Finance v2 (Phase 1): forward-runway config inputs.
--
-- Adds two settable inputs to the fin_config singleton so Shannon can drive the
-- runway model from the dashboard instead of it being derived from trailing
-- burn:
--   * monthly_burn_baseline  — the monthly burn the runway divides by. When set,
--     it replaces the trailing 3-month average (lib/admin/finance.ts). Null =
--     fall back to computed burn, so nothing breaks for an un-configured tenant.
--   * forward_horizon_months — how many months ahead the projected (tier-3)
--     runway looks for unreceived pledges. Defaults to 3.
--
-- Purely additive and nullable: no backfill, nothing reads these until Phase 2,
-- reversible with `alter table ... drop column`. Both inherit org_id from the
-- table default, so they move with the tenant automatically.
--
-- Single-tenant-compatible: fin_config is still addressed as the id=1 singleton.

alter table public.fin_config
  add column if not exists monthly_burn_baseline numeric null;

alter table public.fin_config
  add column if not exists forward_horizon_months int null default 3;

comment on column public.fin_config.monthly_burn_baseline is
  'Monthly burn baseline for the runway model. When set, replaces the trailing 3-month average. Null = fall back to computed burn.';
comment on column public.fin_config.forward_horizon_months is
  'How many months ahead the projected runway tier counts unreceived pledges. Default 3.';
