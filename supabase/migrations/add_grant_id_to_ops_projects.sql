-- Grant workspace, Phase 1 — link each grant to an ops project.
--
-- Every grant gets its own project so the grant page can hold the work of
-- landing it (LOI, budget, narrative, review, submit, report) as real
-- ops_tasks. The link lives on the project, mirroring the existing
-- ops_projects.initiative_id pattern: a project is the child that can point
-- up to its grant and/or its initiative.
--
-- on delete set null (not cascade): if a grant is ever hard-deleted, the
-- project and its task history survive as an orphan rather than cascading the
-- work away. See the spec's open decisions if cascade is ever preferred.
--
-- The unique partial index enforces one-grant-one-project: a second project
-- for the same grant is rejected, which is the backstop against a backfill
-- double-run or a double-click on create. grant_id IS NULL stays unconstrained
-- so ordinary (non-grant) projects are unaffected.
--
-- Additive + idempotent. ops_projects RLS is unchanged (this adds a column,
-- not a table); existing "members write/read ops_projects" policies still
-- govern every insert and read. Nothing reads or writes grant_id yet — the
-- write path (auto-create on grant creation) lands in Phase 2.
--
-- Reversible:
--   drop index if exists public.ops_projects_grant_id_key;
--   alter table public.ops_projects drop column if exists grant_id;

alter table public.ops_projects
  add column if not exists grant_id uuid
    references public.grants(id) on delete set null;

create unique index if not exists ops_projects_grant_id_key
  on public.ops_projects (grant_id)
  where grant_id is not null;
