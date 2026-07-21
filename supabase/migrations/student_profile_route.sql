-- Student profile page (governance-profile-views phase 2): /admin/students/{id}
-- now exists, so registry links (action queue, task chips, global search)
-- deep-link to the record instead of the roster list. Everything else the
-- profile needs — the 'student' ops_tasks link type, the entity_types row,
-- the record lookup — already landed with program_spine_schema.sql.

update public.entity_types
  set route_pattern = '/admin/students/{id}'
  where entity_type = 'student'
    and route_pattern = '/admin/students';

-- ── rollback ──────────────────────────────────────────────
-- update public.entity_types set route_pattern = '/admin/students'
--   where entity_type = 'student';
