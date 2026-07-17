-- Participant spine (spec #4), D3: make the participant lifecycle tenant-neutral.
--
-- Two changes:
--  1. participant_stages gains a `description` — a plain-language line explaining
--     what each stage means, surfaced as a tooltip so "Practice"/"Connect"/etc.
--     stop being opaque. Per-org data like the labels.
--  2. Drop students_stage_check. That CHECK froze the stage to AA's seven keys,
--     so a second org's stages (Safespace's recruited/active/leading/…) would be
--     rejected. Validation moves to the write path (the student routes check the
--     value against the org's own participant_stages), where it's per-tenant.
--
-- students.stage stays a text key matching participant_stages.stage_key (no
-- stage_id FK — the soft key already works and normalizing it would touch every
-- cohort/attendance reader for no tenant-neutrality gain). The 'discover' default
-- is left as-is (a per-org default is a later refinement; the create form always
-- sends an explicit stage).

alter table public.participant_stages add column if not exists description text;

alter table public.students drop constraint if exists students_stage_check;
