-- Close the workspace projects of grants that are already finished.
--
-- Every grant gets a linked ops_projects row (unique on grant_id), created
-- with status 'active'. Until now nothing ever moved that project out of
-- 'active' when the grant itself ended, so grants long since 'closed' (County
-- of San Mateo, Rotary Club of Menlo Park, PACF, Pledgeling, NPT, A to Z…)
-- kept showing on the ops "Active Projects" surface (reported by Shannon).
--
-- The code fix (lib/fundraising/grants.ts syncGrantProjectStatus) now marks a
-- grant's still-active project 'done' whenever the grant reaches a terminal
-- stage ('declined'/'closed'), and creates the project as 'done' when a grant
-- is backfilled straight into a terminal stage. This migration is the one-time
-- backfill for rows that predate it.
--
-- 'awarded'/'active' grants are intentionally left alone — reporting and
-- stewardship work is still live for them.
--
-- Idempotent: re-runs match zero rows. Apply via the Supabase dashboard.

update public.ops_projects p
set status = 'done',
    completed_at = coalesce(p.completed_at, now())
from public.grants g
where g.id = p.grant_id
  and g.stage in ('declined', 'closed')
  and p.status = 'active';
