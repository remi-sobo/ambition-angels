-- Kid→leader link (YL EPA onboarding spec, v1.5 item 1).
--
-- Recon decision: a students-side column, NOT a relationships row —
-- relationships.a_id/b_id are hard FKs to constituents(id), so a student id
-- cannot live there, and "who is my leader" is a single-valued attribute of
-- the student, the exact shape of the existing students.partner_id /
-- students.constituent_id cross-links. Leaders are constituents flagged
-- is_volunteer (add_constituents_is_volunteer.sql) — adults in fundraising
-- wearing a different hat, per the spine entity registry.
--
-- Same-org integrity is enforced at the write path (the student routes
-- validate leader_id against the org's volunteer-flagged constituents),
-- matching how students.stage↔participant_stages is validated. RLS: students
-- policies (program.read/write) already cover the column — no policy change.

alter table public.students
  add column if not exists leader_id uuid references public.constituents(id) on delete set null;

create index if not exists students_leader_idx
  on public.students (leader_id)
  where leader_id is not null;
