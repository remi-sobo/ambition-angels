-- Acknowledgments v2 (Stewardship) — Phase 5: extend the task linked-entity
-- vocabulary in lockstep with the acknowledgment subject vocabulary.
--
-- Phase 1 made `acknowledgments` polymorphic over
-- gift/constituent/opportunity/volunteer/milestone. ops_tasks still only
-- allowed partner/constituent links, so a task spawned to steward a non-gift
-- subject (a foundation/DAF grant opportunity, a milestone) couldn't hang off
-- its real subject. Widen the check so the two vocabularies match.

alter table public.ops_tasks
  drop constraint if exists ops_tasks_linked_entity_type_check;

alter table public.ops_tasks
  add constraint ops_tasks_linked_entity_type_check
  check (
    linked_entity_type is null
    or linked_entity_type in ('partner', 'constituent', 'opportunity', 'volunteer', 'milestone')
  );
