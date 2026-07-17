-- ============================================================================
-- BloomOS  |  Participant spine D3 — AA stage rename + descriptions
-- Apply MANUALLY (or via apply_migration). AA-specific data; not in the RLS-test
-- ordered list. Org: 17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- Relabels AA's journey stages to self-explanatory names and adds a description
-- per stage (surfaced as a tooltip in the roster). stage_key is UNCHANGED, so
-- students.stage values and all references keep working — only display changes.
--   discover→New  learn→Exploring  practice→Practicing  connect→Connecting
--   launch→Launched  alumni→Alumni  withdrawn→Inactive
-- Requires program_stage_tenant_neutral.sql (adds participant_stages.description).
-- ============================================================================

update public.participant_stages as p
set label = v.label, description = v.description
from (values
  ('discover',  'New',        'Just joined — getting oriented, not yet actively engaged.'),
  ('learn',     'Exploring',  'Exploring careers and building future-orientation through the app and sessions.'),
  ('practice',  'Practicing', 'Hands-on — practicing and applying real skills and tasks.'),
  ('connect',   'Connecting', 'Being matched with and meeting a trusted adult or mentor.'),
  ('launch',    'Launched',   'Reached a real opportunity — an internship, program, or placement.'),
  ('alumni',    'Alumni',     'Completed the journey; part of the alumni community.'),
  ('withdrawn', 'Inactive',   'No longer participating — paused, left, or unreachable.')
) as v(stage_key, label, description)
where p.org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22' and p.stage_key = v.stage_key;
