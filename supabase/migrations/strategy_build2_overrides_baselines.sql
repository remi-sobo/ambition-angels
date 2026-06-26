-- Build 2 (B2-1, B2-2, B2-4): structural defaults so a plan can't drift.
--
-- B2-1 — reasoned status override. Objective/goal status is computed from its
-- measures by default; a human may override, but only with a reason, and the
-- override renders as an override.
alter table plan_objectives add column if not exists status_override text;
alter table plan_objectives add column if not exists status_override_reason text;
alter table plan_goals add column if not exists status_override text;
alter table plan_goals add column if not exists status_override_reason text;

-- B2-2 — baselines. Every measure carries where it started, so the surface can
-- show start -> now -> target instead of a wall of "Not started".
alter table plan_kpis add column if not exists baseline numeric;
alter table plan_kpis add column if not exists baseline_date date;

-- B2-4 — editable runway target. The months-of-cushion the runway bridge aims
-- to restore, set in finance config instead of a hardcoded threshold.
alter table fin_config add column if not exists runway_target_months integer;
