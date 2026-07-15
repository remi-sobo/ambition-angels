-- KPI notes — a short "why" next to the number (context, blockers, expected
-- movement). Editable inline on the scorecard and the plan; shown on both.
alter table plan_kpis add column if not exists notes text;
