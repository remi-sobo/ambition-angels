-- Participant spine (spec #4), D4: continuous membership.
--
-- cohort_members.ended_on lets a group model open-ended membership (null =
-- still a member) as well as fixed cycles (a date), without a new table. AA's
-- cohort-bound groups leave it null until a member completes/drops (the member
-- route stamps it then); Safespace's continuous chapters set it only when a
-- student leader actually leaves.
alter table public.cohort_members add column if not exists ended_on date;
