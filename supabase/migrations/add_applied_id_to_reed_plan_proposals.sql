-- Reed for strategy — Phase D: record what an accepted proposal created in the
-- real plan, so it's traceable and so a child proposal can ladder to a parent
-- proposal that was accepted first (resolve parent -> applied_id -> real plan row).
alter table public.reed_plan_proposals add column if not exists applied_id uuid;
