-- Tenant-neutral stewardship assignees: tenant_neutral_assignees.sql dropped
-- the hardcoded ('remi','shannon') checks on the ops columns but missed the
-- one on stewardship_rules.assignee — so a second org literally could not
-- route its stewardship matrix to its own people. Same fix, same reasoning:
-- assignee handles are per-org data (lib/admin/assignees.ts), not schema.

alter table public.stewardship_rules drop constraint if exists stewardship_rules_assignee_check;
