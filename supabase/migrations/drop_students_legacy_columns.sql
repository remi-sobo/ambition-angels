-- Participant spine (spec #4), D5: drop AA-specific student columns.
--
-- grade / school / dob / guardian_name / guardian_email / guardian_phone moved
-- onto the per-org custom-field registry in D2 (participant_aa_custom_fields.
-- MANUAL.sql seeded the AA defs and backfilled every value into
-- students.custom_fields). D2–D4 shipped a dual-write shim keeping these columns
-- in lockstep so unmigrated readers stayed current; D5 migrates the last readers
-- (cohort roster, session sheet, global search, intake-accept) onto custom_fields
-- and removes the shim, so the columns are now dead weight.
--
-- Deploy-before-migrate (Phase C rule): apply only after the D5 code is live, so
-- nothing writes to a dropped column. Idempotent (drop column if exists) and
-- lossless (values live in custom_fields). `stage` stays — it is the universal
-- lifecycle column, validated per-org against participant_stages, not dropped.
alter table public.students drop column if exists grade;
alter table public.students drop column if exists school;
alter table public.students drop column if exists dob;
alter table public.students drop column if exists guardian_name;
alter table public.students drop column if exists guardian_email;
alter table public.students drop column if exists guardian_phone;
