-- Build 2 (funder-readiness): make the narrative's proof strip editable at its
-- source instead of hardcoded in the component. Proof points live on the org's
-- foundation row as a jsonb array of { value, label } objects, edited in the
-- Foundation panel on /admin/strategic-plan and read by Movement 1.
alter table plan_foundation add column if not exists proof_points jsonb;
