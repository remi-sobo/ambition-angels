-- Fundraising pipeline stages, part 2 of 2 (apply fundraising_pipeline_config.sql
-- FIRST): remap opportunities.stage onto the ten-stage Sales taxonomy, swap the
-- hardcoded check constraint for a composite FK into pipeline_stages, and flip
-- stage ownership to Bloom (inbound sync sets stage on INSERT only).
-- Spec: specs/fundraising-pipeline-stages.md.
--
-- ORDER MATTERS inside this file: drop the check constraint, remap, verify
-- zero orphans (hard gate), then add the FK. Do not reorder.
--
-- Everything here ships in ONE migration on purpose: once Sales-pipeline rows
-- carry the new keys, the old fr_sync_hubspot_to_spine() would write legacy
-- keys that violate the FK on its next run, and the old v_revenue_schedule
-- would misclassify the new terminal stages as open pipeline. Function + view
-- must move in the same transaction as the data.
--
-- Idempotent. Apply via the Supabase dashboard.
-- Down path: drop the FK, re-add the old check constraint, re-run the inverse
-- remap keyed off external_stage (never touched here, so the collapse is fully
-- reconstructable), and re-apply surface_committed_deals_in_revenue_schedule.sql
-- + create_fr_pursue_function.sql for the function/view bodies.

-- ── 1. Drop the hardcoded five-stage check ───────────────────────────────────
alter table public.opportunities drop constraint if exists opportunities_stage_check;

-- ── 2. Remap Sales-pipeline rows from the raw HubSpot stage (lossless) ───────

-- Rows that never got a pipeline (the one bloom-native ask, and any legacy
-- inserts) live on the default pipeline. Must happen before the remap (so they
-- are picked up) and before the FK: a null pipeline would silently dodge a
-- composite FK (MATCH SIMPLE).
update public.opportunities set pipeline = 'default' where pipeline is null;

update public.opportunities o set stage = m.new_key
from (values
  ('closedwon',            'closed_won'),
  ('closedlost',           'closed_lost'),
  ('59213864',             'needs_appointment'),
  ('59189578',             'pledged'),
  ('3448504042',           'meeting_complete'),
  ('68574502',             'ask_made'),
  ('3448542951',           'on_hold'),
  ('appointmentscheduled', 'appointment_scheduled'),
  ('68574501',             'identified'),
  ('3448542949',           'researched')
) as m(ext, new_key)
where o.pipeline = 'default' and o.external_stage = m.ext and o.stage is distinct from m.new_key;

-- Bloom-native Sales rows (no external_stage): legacy funnel key → new key.
update public.opportunities o set stage = m.new_key
from (values
  ('identify',  'identified'),
  ('qualify',   'researched'),
  ('cultivate', 'researched'),
  ('solicit',   'ask_made'),
  ('steward',   'closed_won'),
  ('lost',      'closed_lost')
) as m(old_key, new_key)
where o.pipeline = 'default' and o.external_stage is null and o.stage = m.old_key;

-- Safety net for default-pipeline rows whose external_stage matched nothing
-- above (e.g. a HubSpot stage created after this migration was written): fold
-- them onto the config-driven first open stage rather than orphaning them.
update public.opportunities o
set stage = (
  select ps.key from public.pipeline_stages ps
  where ps.org_id = o.org_id and ps.pipeline = o.pipeline and ps.is_active
  order by ps.sort_order limit 1
)
where o.pipeline = 'default'
  and o.stage in ('identify','qualify','cultivate','solicit','steward','lost')
  and exists (
    select 1 from public.pipeline_stages ps
    where ps.org_id = o.org_id and ps.pipeline = o.pipeline
  );

-- ── 3. HARD GATE: zero orphans, then the composite FK ────────────────────────
do $$
declare
  orphans bigint;
begin
  select count(*) into orphans
  from public.opportunities o
  left join public.pipeline_stages s
    on s.org_id = o.org_id and s.pipeline = o.pipeline and s.key = o.stage
  where s.id is null;
  if orphans > 0 then
    raise exception
      'fundraising_pipeline_remap: % opportunities have no matching pipeline_stages row — fix before the FK (did fundraising_pipeline_config.sql run?)',
      orphans;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'opportunities_stage_fk'
      and conrelid = 'public.opportunities'::regclass
  ) then
    alter table public.opportunities
      add constraint opportunities_stage_fk
      foreign key (org_id, pipeline, stage)
      references public.pipeline_stages (org_id, pipeline, key);
  end if;
end $$;

-- Stage no longer has a hardcoded default; every insert path sets it from
-- config (app code + the functions below).
alter table public.opportunities alter column stage drop default;

-- The "live asks" partial index excluded the legacy terminal stages only;
-- rebuild it around the new terminal keys so closed/held Sales rows stay out.
drop index if exists opportunities_next_step_idx;
create index if not exists opportunities_next_step_idx
  on public.opportunities (next_step_due)
  where stage not in ('steward','lost','closed_won','closed_lost','on_hold');

-- ── 4. Inbound sync: Bloom owns stage after first touch ──────────────────────
-- Faithful CREATE OR REPLACE of the live function (surface_committed_deals_in_
-- revenue_schedule.sql) with step 3 changed: stage is set from pipeline_stages
-- config on INSERT (external_stage_id lookup, falling back to the pipeline's
-- first active stage, then to the legacy fr_map_dealstage); on UPDATE only
-- external_stage (and the non-stage fields) refresh — stage is NOT rewritten,
-- so a Bloom move sticks. Exception: when the deal moved to a different
-- HubSpot pipeline, the old stage key would violate the new pipeline's FK, so
-- stage is remapped along with it. Every other step is verbatim. search_path
-- re-pinned (CREATE OR REPLACE drops SET clauses).
create or replace function public.fr_sync_hubspot_to_spine()
 returns void
 language plpgsql
 set search_path = public, extensions, pg_temp
as $function$
begin
  -- 1. Companies → organization constituents
  insert into constituents (org_id, type, org_name, source, external_ids)
  select c.org_id, 'organization', c.name, 'hubspot_import',
         jsonb_build_object('hubspot_company', c.hubspot_id)
  from hs_companies c
  where c.name is not null and c.name <> ''
    and not exists (select 1 from constituents x where x.external_ids->>'hubspot_company' = c.hubspot_id);

  -- 2a. Stamp HubSpot ids onto existing person constituents (email match)
  update constituents x
  set external_ids = x.external_ids || jsonb_build_object('hubspot', h.hubspot_id),
      source = case when x.source = 'manual' then 'hubspot_import' else x.source end
  from (
    select distinct on (lower(email)) hubspot_id, lower(email) as email
    from hs_contacts where email is not null and email <> ''
    order by lower(email), created_in_hubspot_at asc nulls last
  ) h
  where not (x.external_ids ? 'hubspot') and x.type = 'person'
    and h.email = any (select lower(e) from unnest(x.emails) e);

  -- 2b. Remaining contacts → new person constituents
  insert into constituents (org_id, type, first_name, last_name, emails, phones, source, external_ids)
  select c.org_id, 'person', c.first_name, c.last_name,
         case when c.email is not null and c.email <> '' then array[lower(c.email)] else '{}'::text[] end,
         case when c.phone is not null and c.phone <> '' then array[c.phone] else '{}'::text[] end,
         'hubspot_import', jsonb_build_object('hubspot', c.hubspot_id)
  from hs_contacts c
  where (coalesce(c.first_name,'')<>'' or coalesce(c.last_name,'')<>'' or coalesce(c.email,'')<>'')
    and not exists (select 1 from constituents x where x.external_ids->>'hubspot' = c.hubspot_id)
    and not exists (select 1 from constituents x where c.email is not null and c.email<>''
                    and lower(c.email) = any (select lower(e) from unnest(x.emails) e));

  -- 3. Deals → opportunities. Stage from per-org config on INSERT (first-touch
  --    only); on UPDATE Bloom owns stage — only external_stage and the money
  --    fields refresh. Partnership-pipeline deals ('59855776') live in
  --    `partners`, not here — skip them.
  insert into opportunities (org_id, constituent_id, name, stage, external_stage, ask_amount,
                             expected_close, probability, pipeline, external_source, external_id)
  select d.org_id, coalesce(pc.id, oc.id), d.name,
         sk.stage_key, d.stage, d.amount, d.close_date,
         coalesce(sk.stage_prob, fr_stage_probability(fr_map_dealstage(d.stage))),
         coalesce(d.pipeline, 'default'),
         'hubspot', d.hubspot_id
  from hs_deals d
  left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
  left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
  cross join lateral (
    select
      coalesce(
        (select ps.key from pipeline_stages ps
          where ps.org_id = d.org_id and ps.pipeline = coalesce(d.pipeline, 'default')
            and ps.external_stage_id = d.stage and ps.is_active
          order by ps.sort_order limit 1),
        (select ps.key from pipeline_stages ps
          where ps.org_id = d.org_id and ps.pipeline = coalesce(d.pipeline, 'default')
            and ps.is_active
          order by ps.sort_order limit 1),
        fr_map_dealstage(d.stage)) as stage_key,
      (select ps.probability_default from pipeline_stages ps
        where ps.org_id = d.org_id and ps.pipeline = coalesce(d.pipeline, 'default')
          and ps.external_stage_id = d.stage and ps.is_active
        order by ps.sort_order limit 1) as stage_prob
  ) sk
  where d.pipeline is distinct from '59855776'
  on conflict (external_source, external_id) where external_id is not null
  do update set external_stage = excluded.external_stage,
                ask_amount = excluded.ask_amount,
                expected_close = excluded.expected_close,
                pipeline = excluded.pipeline,
                stage = case when opportunities.pipeline is distinct from excluded.pipeline
                             then excluded.stage
                             else opportunities.stage end,
                constituent_id = coalesce(opportunities.constituent_id, excluded.constituent_id),
                probability = coalesce(opportunities.probability, excluded.probability),
                updated_at = now();

  -- 4. Closedwon deals → gifts; deduped vs grants AND payment gifts (no double-count)
  insert into gifts (org_id, constituent_id, amount, gift_date, method,
                     external_source, external_id, acknowledgment_status)
  select d.org_id, coalesce(pc.id, oc.id), d.amount, d.close_date, 'other',
         'hubspot_deal', d.hubspot_id,
         case when d.close_date >= current_date - interval '30 days' then 'pending' else 'not_required' end
  from hs_deals d
  left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
  left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
  where d.stage = 'closedwon' and d.amount > 0 and d.close_date is not null
    and d.pipeline is distinct from '59855776'
    and coalesce(pc.id, oc.id) is not null
    and not exists (select 1 from gifts g where g.external_source='hubspot_deal' and g.external_id=d.hubspot_id)
    and not exists (select 1 from grants gr where gr.notes = 'Imported from HubSpot deal '||d.hubspot_id)
    and not exists (
      select 1 from gifts g
      where g.constituent_id = coalesce(pc.id, oc.id)
        and g.external_source is distinct from 'hubspot_deal'
        and g.amount = d.amount
        and abs(g.gift_date - d.close_date) <= 7);

  -- 5. AIG members → constituent tag
  update constituents x
  set tags = array_append(x.tags, 'AIG'), updated_at = now()
  where not ('AIG' = any(x.tags))
    and exists (
      select 1 from hs_deals d
      left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
      left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
      where d.stage = '3448542950' and coalesce(pc.id, oc.id) = x.id);

  -- 6. Engagements → interactions
  insert into interactions (org_id, constituent_id, kind, occurred_at, notes, logged_by,
                            external_source, external_id)
  select e.org_id, x.id,
         case when e.engagement_type ilike '%email%' then 'email'
              when e.engagement_type ilike 'call%' then 'call'
              when e.engagement_type ilike 'meeting%' then 'meeting'
              else 'note' end,
         coalesce(e.occurred_at, e.created_at),
         nullif(trim(coalesce(e.subject,'') || case when coalesce(e.body_preview,'')<>''
                then ' — ' || e.body_preview else '' end), ''),
         'hubspot', 'hubspot', e.hubspot_id
  from hs_engagements e
  cross join lateral unnest(e.contact_ids) as cid
  join constituents x on x.external_ids->>'hubspot' = cid
  on conflict (external_source, external_id, constituent_id) where external_id is not null
  do nothing;
end;
$function$;

-- ── 5. Strategy "pursue" sets stage + pipeline from config ───────────────────
-- Faithful CREATE OR REPLACE of create_fr_pursue_function.sql with the insert
-- made FK-safe: pipeline is set explicitly ('default') and stage comes from the
-- org's config (first active open stage) instead of the hardcoded 'cultivate'.
-- Still SECURITY INVOKER; org_id still falls to the resident-org default.
create or replace function public.fr_pursue_funder_angle(p_fa_id uuid, p_owner text)
returns uuid
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_constituent uuid;
  v_existing    uuid;
  v_angle_name  text;
  v_opp         uuid;
  v_found       boolean := false;
  v_org         uuid;
  v_stage       text;
begin
  select fa.constituent_id, fa.opportunity_id, sa.name, true
    into v_constituent, v_existing, v_angle_name, v_found
  from funder_angles fa
  left join strategy_angles sa on sa.id = fa.angle_id
  where fa.id = p_fa_id;

  if not v_found then
    raise exception 'funder_angle % not found', p_fa_id using errcode = 'no_data_found';
  end if;

  if v_existing is not null then
    return v_existing;  -- already pursued
  end if;

  select org_id into v_org from constituents where id = v_constituent;
  v_stage := coalesce(
    (select ps.key from pipeline_stages ps
      where ps.org_id = v_org and ps.pipeline = 'default'
        and ps.is_active and ps.stage_type = 'open'
      order by ps.sort_order limit 1),
    'cultivate');

  insert into opportunities (constituent_id, name, stage, pipeline, owner)
  values (v_constituent, v_angle_name, v_stage, 'default', p_owner)
  returning id into v_opp;

  update funder_angles
     set opportunity_id = v_opp, stage = 'pursuing', decision = 'pursue'
   where id = p_fa_id;

  return v_opp;
end;
$$;

-- ── 6. v_revenue_schedule: pipeline branch reads stage_type from config ──────
-- Faithful CREATE OR REPLACE of the LIVE view (surface_committed_deals_in_
-- revenue_schedule.sql as amended by dedup_commitments_against_gifts.sql and
-- fix_due_tier_overdue_commitments_and_stale_grants.sql) with ONE branch
-- changed: "open weighted pipeline" now joins pipeline_stages and takes
-- stage_type='open' instead of the hardcoded not-in ('lost','steward'), so the
-- ten new Sales stages classify correctly (closed_won/closed_lost/on_hold out;
-- pledged stays out of the weighted branch via the external_stage exclusion —
-- it is already counted at full value by the commitment branch below).
-- All other branches are verbatim.
create or replace view public.v_revenue_schedule
with (security_invoker = true) as

  -- pledge_payments: committed, dated.
  select
    pp.org_id,
    'pledge'::text                                    as source_type,
    pp.id                                             as source_id,
    pp.pledge_id                                      as parent_id,
    coalesce(c.org_name,
             nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
             'Pledge')                                as label,
    date_trunc('month', pp.due_date)::date            as month,
    pp.due_date                                       as due_date,
    pp.expected_amount                                as gross_amount,
    pp.expected_amount                                as weighted_amount,
    'committed'::text                                 as confidence,
    coalesce(f.restricted, p.fund_id is not null)     as restricted,
    f.name                                            as restricted_to,
    pp.status                                         as status,
    false                                             as needs_schedule
  from public.pledge_payments pp
  join public.pledges p          on p.id = pp.pledge_id
  left join public.constituents c on c.id = p.constituent_id
  left join public.funds f        on f.id = p.fund_id
  where pp.status in ('scheduled','overdue')

  union all

  -- grant tranches: scheduled grant_payments.
  select
    gp.org_id,
    'grant'::text,
    gp.id,
    g.id,
    coalesce(g.name, 'Grant'),
    date_trunc('month', gp.due_date)::date,
    gp.due_date,
    gp.expected_amount,
    gp.expected_amount,
    'committed'::text,
    (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name,
    'awarded'::text,
    false
  from public.grant_payments gp
  join public.grants g           on g.id = gp.grant_id
  left join public.funds gf      on gf.id = g.fund_id
  where gp.status = 'scheduled'

  union all

  -- awarded grants with NO tranche schedule yet: lump at period_start.
  select
    g.org_id,
    'grant'::text,
    g.id,
    g.id,
    coalesce(g.name, 'Grant'),
    date_trunc('month', coalesce(g.period_start, g.created_at::date))::date,
    coalesce(g.period_start, g.created_at::date),
    g.amount_awarded,
    g.amount_awarded,
    'committed'::text,
    (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name,
    'awarded'::text,
    true
  from public.grants g
  left join public.funds gf on gf.id = g.fund_id
  where g.amount_awarded is not null
    and g.amount_awarded > 0
    and g.stage in ('awarded', 'active')
    and not exists (
      select 1 from public.grant_payments gp
      where gp.grant_id = g.id and gp.status = 'scheduled'
    )

  union all

  -- open weighted pipeline: config-open opportunities, dated, with an ask.
  -- Externally-committed deals (AIG Member / Pledged raw stages) are excluded
  -- here — they appear in the commitment branch at full value instead.
  select
    o.org_id,
    'pipeline'::text,
    o.id,
    o.id,
    coalesce(o.name, 'Opportunity'),
    date_trunc('month', o.expected_close)::date,
    o.expected_close,
    o.ask_amount,
    round(o.ask_amount * coalesce(o.probability, s.probability_default, 0) / 100.0, 2),
    'projected'::text,
    false,
    null::text,
    'open'::text,
    false
  from public.opportunities o
  join public.pipeline_stages s
    on s.org_id = o.org_id
   and s.pipeline = coalesce(o.pipeline, 'default')
   and s.key = o.stage
  where s.stage_type = 'open'
    and (o.external_stage is null or o.external_stage not in ('3448542950', '59189578'))
    and o.expected_close >= current_date
    and o.ask_amount > 0

  union all

  -- committed commitments: HubSpot "AIG Member" (3448542950) and "Pledged"
  -- (59189578) deals — the donor has committed but the money hasn't landed yet.
  -- Counted at full value (committed). Filtered on the RAW dealstage so the
  -- closedwon deals (already turned into gifts) never appear here, and deduped
  -- against gifts that already landed.
  select
    o.org_id,
    'commitment'::text,
    o.id,
    o.id,
    coalesce(o.name, 'Commitment'),
    date_trunc('month', o.expected_close)::date,
    o.expected_close,
    o.ask_amount,
    o.ask_amount,
    'committed'::text,
    false,
    null::text,
    'committed'::text,
    false
  from public.opportunities o
  where o.external_stage in ('3448542950', '59189578')
    and o.ask_amount > 0
    and not exists (
      select 1 from public.gifts g
      where g.constituent_id = o.constituent_id
        and g.amount = o.ask_amount
        and abs(g.gift_date - o.expected_close) <= 7
    )

  union all

  -- manual one-off commitments (fin_revenue_commitments).
  select
    rc.org_id,
    'manual'::text,
    rc.id,
    rc.id,
    coalesce(rc.source_name, 'Manual commitment'),
    date_trunc('month', rc.expected_date)::date,
    rc.expected_date,
    rc.amount,
    case when rc.status = 'projected'
         then round(rc.amount * coalesce(rc.probability, 1), 2)
         else rc.amount end,
    case when rc.status = 'secured' then 'committed' else 'projected' end,
    coalesce(rc.restricted, false),
    rc.restricted_to,
    rc.status,
    false
  from public.fin_revenue_commitments rc
  where rc.external_ref is null
    and rc.status in ('secured', 'projected')
    and rc.expected_date is not null;

comment on view public.v_revenue_schedule is
  'Canonical dated schedule of expected inflows (pledges, grants, weighted pipeline, committed AIG/Pledged deals, manual). Pipeline openness comes from pipeline_stages.stage_type. security_invoker — RLS of the underlying tables applies. Read by finance runway, the revenue/pledges pages, and Horizon. Never read hs_deals for finance numbers; pipeline + commitments come from opportunities.';

grant select on public.v_revenue_schedule to authenticated;

-- Verify (after apply):
--   select stage, count(*) from public.opportunities where pipeline='default' group by stage;
-- Expect: closed_won 226, closed_lost 146, needs_appointment 15, pledged 11,
--         meeting_complete 5, ask_made 4, on_hold 3, appointment_scheduled 2,
--         identified 1 (the bloom-native row).
