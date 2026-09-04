-- Cron restoration, step 1: close the three orphaned sync jobs.
--
-- Context: docs/cron-restoration-plan.md §6 (the double-submit bug) and
-- docs/interaction-capture-diagnostic.md §1.1. Each of these rows is the
-- losing half of a double-click pair; the client polled the other id and this
-- one has sat in `running` since. /api/cron/hubspot-sync and
-- /api/cron/gmail-sync resume the newest row when it is `running`, so a
-- stuck row would block a cron resume if it were ever the newest. None of
-- them is the newest today, but they are closed before CRON_SECRET is fixed
-- so the schedules never meet a stale `running` row.
--
-- NOT a migration. One-off data fix, to be pasted into the Supabase SQL
-- editor by a human after review. Idempotent: re-running affects zero rows.
--
-- Verified in production 2026-09-03 before writing this:
--   hs_sync_jobs    9a1c2d93-a45a-4c25-a0e0-1ce83be3a22e  running since 2026-05-22 20:48 UTC  (twin of 985effdf, 0.7 s apart)
--   hs_sync_jobs    ecdbe79a-877a-4db6-88df-9688605c91da  running since 2026-07-21 00:02 UTC  (twin of 75fca19b, 1.4 s apart)
--   gmail_sync_jobs 073206a3-86b1-4ed2-9b02-309fe40246f9  running since 2026-06-17 21:05 UTC  (twin of acc825b1, 12 s apart)
-- Left alone on purpose: gmail_sync_jobs 236a6e7a (running, newest row);
-- the first authenticated gmail-sync tick resumes it, which is intended.

begin;

update hs_sync_jobs
set status      = 'failed',
    finished_at = now(),
    updated_at  = now(),
    errors      = errors || jsonb_build_array(jsonb_build_object(
                    'step',        coalesce(current_step, 'contacts'),
                    'message',     'Closed by operator 2026-09-03: orphaned duplicate of a double-submitted sync (docs/cron-restoration-plan.md §6). Never ran to completion.',
                    'occurred_at', now()
                  ))
where id in (
  '9a1c2d93-a45a-4c25-a0e0-1ce83be3a22e',
  'ecdbe79a-877a-4db6-88df-9688605c91da'
)
and status = 'running';

update gmail_sync_jobs
set status      = 'failed',
    finished_at = now(),
    updated_at  = now(),
    page_token  = null,
    errors      = errors || jsonb_build_array(jsonb_build_object(
                    'message',     'Closed by operator 2026-09-03: orphaned duplicate of a double-submitted backfill (docs/cron-restoration-plan.md §6). Never ran to completion.',
                    'occurred_at', now()
                  ))
where id = '073206a3-86b1-4ed2-9b02-309fe40246f9'
and status = 'running';

-- Expect: 2 rows, then 1 row. Verify before commit:
select 'hs_sync_jobs' as tbl, id, status, finished_at
from hs_sync_jobs
where id in ('9a1c2d93-a45a-4c25-a0e0-1ce83be3a22e', 'ecdbe79a-877a-4db6-88df-9688605c91da')
union all
select 'gmail_sync_jobs', id, status, finished_at
from gmail_sync_jobs
where id = '073206a3-86b1-4ed2-9b02-309fe40246f9';

-- After this commits, the only `running` row in either table should be
-- gmail_sync_jobs 236a6e7a:
--   select id, status from hs_sync_jobs where status = 'running';      -- 0 rows
--   select id, status from gmail_sync_jobs where status = 'running';   -- 236a6e7a only

commit;
