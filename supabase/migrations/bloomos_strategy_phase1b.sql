-- BloomOS Strategy, Phase 1b (specs/bloomos-strategy.md, Appendix B).
-- Apply this WITH the Phase 1 code PR, never before it. It closes the
-- org_id-default trap and aligns the initiative status vocabulary, both of
-- which the OLD routes depended on:
--   * The old routes relied on the org_id column default to populate org_id.
--     The new routes set org_id from getOrgContext() explicitly, so the
--     default is now both unnecessary and dangerous (a second tenant's writes
--     would silently land in Ambition Angels). Drop it.
--   * The old initiative routes wrote status='doing'. The new routes write
--     'in_progress' so initiatives and tasks share one vocabulary. Migrate the
--     (currently unseeded) rows and tighten the check.
--
-- Reversible: to roll back, re-add the defaults (set to the AA org id) and
-- restore the old check constraint.

-- Close the org_id-default trap on the two live tables.
alter table plan_goals alter column org_id drop default;
alter table plan_initiatives alter column org_id drop default;

-- Normalize initiative status doing -> in_progress, then tighten the check so
-- initiatives and tasks share the progress vocabulary (todo·in_progress·done).
update plan_initiatives set status = 'in_progress' where status = 'doing';
alter table plan_initiatives drop constraint if exists plan_initiatives_status_check;
alter table plan_initiatives add constraint plan_initiatives_status_check
  check (status in ('todo','in_progress','done'));
