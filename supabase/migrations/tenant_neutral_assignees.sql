-- Tenant-neutral assignees: drop the hardcoded ('remi','shannon') check
-- constraints on ops assignment/attribution columns.
--
-- These constraints froze tenant one's two operators into the schema: a second
-- org literally could not assign a task to its own people, and every insert's
-- created_by had to masquerade as 'remi'. Assignee handles are now derived
-- per-user from profile display names (lib/admin/assignees.ts), the option
-- lists come from org memberships, and the owner_uuid_promotion trigger
-- already maps any first-name handle onto a real profile uuid — so the fixed
-- set is obsolete. The columns stay free text until the Ring 1 move to real
-- user references.

alter table public.ops_tasks    drop constraint if exists ops_tasks_assigned_to_check;
alter table public.ops_tasks    drop constraint if exists ops_tasks_created_by_check;
alter table public.ops_projects drop constraint if exists ops_projects_assigned_to_check;
alter table public.ops_projects drop constraint if exists ops_projects_created_by_check;
