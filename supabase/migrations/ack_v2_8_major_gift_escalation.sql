-- Acknowledgments v2 — Phase 8: big gifts come to Remi as well.
--
-- Every gift is a Shannon task (receipt + thank-you). A MAJOR gift additionally
-- spawns a task for Remi for a personal touch — in addition to Shannon's, not
-- instead of it. This is modeled as a new 'escalate' rule action that the engine
-- evaluates independently of the first-match primary rule, so it's orthogonal to
-- which type/channel rule Shannon's task came from (first gift, in-kind, $250+,
-- etc.). The threshold lives in the rule's conditions, never in code.
--
-- The escalation rule is ranked LAST on purpose: the engine that skips it for
-- the primary decision ships alongside this; ranking it last means even code
-- that doesn't yet skip it never returns it as a primary (every recent gift
-- matches an earlier Shannon rule first), so there's no rollout-order hazard.

alter table public.stewardship_rules
  drop constraint if exists stewardship_rules_action_check;
alter table public.stewardship_rules
  add constraint stewardship_rules_action_check
  check (action in ('auto_email','create_task','create_task_and_draft','none','escalate'));

-- The major-gift primary task now goes to Shannon like the rest.
update public.stewardship_rules
set assignee = 'shannon',
    name = 'Major gift $1,000+, personal call',
    updated_at = now()
where action = 'create_task'
  and assignee = 'remi'
  and conditions->>'min_amount' = '1000';

-- Major gift also creates a Remi task (orthogonal escalation, ranked last).
insert into public.stewardship_rules
  (org_id, name, rank, conditions, action, channel, sla_hours, assignee, active)
select orgs.id, 'Major gift, also a task for Remi', 900,
  '{"min_amount": 1000, "max_age_days": 30}'::jsonb, 'escalate', 'call', 24, 'remi', true
from orgs
where orgs.slug = 'ambition-angels'
  and not exists (
    select 1 from stewardship_rules r where r.org_id = orgs.id and r.action = 'escalate'
  );
