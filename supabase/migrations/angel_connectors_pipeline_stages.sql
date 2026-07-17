-- Angel Connectors pipeline ('727459407') gets its real HubSpot taxonomy,
-- replacing the collapsed legacy five-stage funnel it was seeded with for FK
-- integrity (fundraising_pipeline_config.sql).
--
-- Stage set + order confirmed from HubSpot's dealstage property definition
-- (2026-07-17). The pipeline tracks connector activation, not money: an angel
-- is identified and pitched; once they COMMIT, the work continues — they ID
-- their top-3 targets, mine LinkedIn, send outreach, and book meetings with
-- their connections. Committed is the pipeline's "won"; the activation stages
-- after it stay open (live work). No lost stage exists in HubSpot for this
-- pipeline, so none is seeded — the board's Lost button hides itself.
-- None of these deals carry ask amounts, so forecast math is unaffected.
--
-- Idempotent. Order matters: seed new stages, remap rows off external_stage,
-- then delete the now-unreferenced legacy rows (the composite FK from
-- opportunities would reject the delete if anything still pointed at them).

do $$
declare
  aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    return; -- non-AA database (e.g. the RLS scratch harness)
  end if;

  -- 1. Seed the real taxonomy (HubSpot display order, ids from dealstage).
  insert into public.pipeline_stages
    (org_id, pipeline, key, label, sort_order, stage_type, external_stage_id, probability_default)
  select aa, '727459407', v.key, v.label, v.sort_order, v.stage_type, v.ext, v.prob
  from (values
    ('identified',         'Identified',                          1, 'open', '1060753811', 10),
    ('pitched',            'Pitched',                             2, 'open', '1060753812', 40),
    ('committed',          'Committed',                           3, 'won',  '1060753813', 100),
    ('big_3_idd',          'Big 3 ID''d',                         4, 'open', '1060753814', null::int),
    ('linkedin_mined',     'LinkedIn Mined',                      5, 'open', '1060753815', null),
    ('outreach_sent',      'Outreach Sent',                       6, 'open', '1060753816', null),
    ('meetings_scheduled', 'Meetings Scheduled w/ Connections',   7, 'open', '1060753817', null)
  ) as v(key, label, sort_order, stage_type, ext, prob)
  on conflict (org_id, pipeline, key) do nothing;

  -- 2. Remap the pipeline's rows off the raw HubSpot stage (lossless).
  update public.opportunities o set stage = ps.key
  from public.pipeline_stages ps
  where o.org_id = aa and o.pipeline = '727459407'
    and ps.org_id = aa and ps.pipeline = '727459407'
    and ps.external_stage_id = o.external_stage
    and o.stage is distinct from ps.key;

  -- Bloom-native rows with no external_stage (none today; safety net): fold
  -- legacy keys onto the closest new stage.
  update public.opportunities o set stage = m.new_key
  from (values
    ('identify',  'identified'),
    ('qualify',   'identified'),
    ('cultivate', 'pitched'),
    ('solicit',   'pitched'),
    ('steward',   'committed'),
    ('lost',      'identified')
  ) as m(old_key, new_key)
  where o.org_id = aa and o.pipeline = '727459407'
    and o.external_stage is null and o.stage = m.old_key;

  -- 3. Retire the legacy collapsed stages, now unreferenced. Guarded so a
  --    row that somehow still holds asks survives (and the FK agrees).
  delete from public.pipeline_stages ps
  where ps.org_id = aa and ps.pipeline = '727459407'
    and ps.key in ('identify','qualify','cultivate','solicit','steward','lost')
    and not exists (
      select 1 from public.opportunities o
      where o.org_id = ps.org_id and o.pipeline = ps.pipeline and o.stage = ps.key
    );
end $$;

-- Verify: select key, label, sort_order, stage_type from public.pipeline_stages
--         where pipeline='727459407' order by sort_order;  -- expect the 7 new rows
--         select stage, count(*) from public.opportunities
--         where pipeline='727459407' group by stage;       -- expect identified 7, committed 1
