-- Tasks on bench prospects (LYBUNT/SYBUNT actionability chunk).
--
-- The Prospects bench (fr_prospects) is already a registry entity type
-- (spine_entity_registry.sql seeds 'fr_prospects' with a per-record route),
-- but the ops_tasks link vocabulary was widened last by program_spine_schema
-- without it — so "attach a follow-up task to this prospect" had nowhere to
-- land. Add it. Must run AFTER program_spine_schema.sql (each widening drops
-- and re-creates the CHECK with the full list).

alter table public.ops_tasks
  drop constraint if exists ops_tasks_linked_entity_type_check;
alter table public.ops_tasks
  add constraint ops_tasks_linked_entity_type_check
  check (
    linked_entity_type is null
    or linked_entity_type in (
      'partner', 'constituent', 'opportunity', 'volunteer', 'milestone',
      'student', 'cohort', 'application', 'program', 'grant', 'document', 'metric',
      'fr_prospects'
    )
  );
