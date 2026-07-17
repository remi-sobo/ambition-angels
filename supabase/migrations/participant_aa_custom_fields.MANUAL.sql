-- ============================================================================
-- BloomOS  |  Participant spine D2 — AA custom-field defs + backfill
-- Apply MANUALLY in the Supabase SQL editor (or via apply_migration). Not
-- auto-applied and NOT in the RLS-test ordered list (AA-specific data, keyed to
-- the real AA org, like the other *.MANUAL.sql seeds).
-- Org: 17c75da8-082d-4c8f-b00b-a4100fb2eb22
--
-- Moves AA's participant fields (grade / school / dob / guardian_*) off the
-- hardcoded students columns onto the per-org custom-field registry seeded in
-- participant_custom_fields.sql. Idempotent. The legacy columns are LEFT IN
-- PLACE (still hold the pre-D2 values for rollback) and are dropped in D5, after
-- D2's code — which reads custom_fields with a legacy-column fallback and writes
-- only custom_fields — has deployed and smoked.
--
-- ORDERING: apply this so the six defs exist by the time D2's code is live; the
-- code removes the hardcoded grade/guardian inputs and renders these from the
-- registry instead.
-- ============================================================================

do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if aa is null then raise exception 'ambition-angels org not found'; end if;

  -- The six defs (sort_order mirrors the old form order).
  insert into public.custom_field_defs (org_id, entity_type, key, label, field_type, sort_order) values
    (aa, 'student', 'grade',          'Grade',          'text',  10),
    (aa, 'student', 'school',         'School',         'text',  20),
    (aa, 'student', 'dob',            'Date of birth',  'date',  30),
    (aa, 'student', 'guardian_name',  'Guardian name',  'text',  40),
    (aa, 'student', 'guardian_email', 'Guardian email', 'email', 50),
    (aa, 'student', 'guardian_phone', 'Guardian phone', 'phone', 60)
  on conflict (org_id, entity_type, key) do nothing;

  -- Backfill: fold each student's legacy column values into custom_fields.
  -- jsonb_strip_nulls drops absent fields; `||` preserves any existing keys and
  -- overlays the columns (idempotent — re-running restates the same values).
  update public.students s
  set custom_fields = coalesce(s.custom_fields, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'grade',          s.grade,
        'school',         s.school,
        'dob',            to_jsonb(s.dob),
        'guardian_name',  s.guardian_name,
        'guardian_email', s.guardian_email,
        'guardian_phone', s.guardian_phone))
  where s.org_id = aa;
end $$;
