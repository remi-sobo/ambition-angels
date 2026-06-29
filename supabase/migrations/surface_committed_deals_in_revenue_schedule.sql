-- Surface committed major-gift / membership commitments in the forecast.
--
-- Problem (reported by Shannon): multi-year AIG commitments and "Pledged" deals
-- are invisible to the forecast. They live in HubSpot at the "AIG Member"
-- (3448542950) and "Pledged" (59189578) dealstages — both map to the BloomOS
-- "steward" funnel stage — and v_revenue_schedule deliberately EXCLUDES steward
-- from its weighted-pipeline branch (committed money is meant to come from
-- pledges/gifts). With the pledges table empty, that dated, accepted money
-- ($400k of future commitments today) falls into a gap: not projected pipeline,
-- not a pledge, not yet a gift. So the forecast never sees it.
--
-- Fix: add a "commitment" branch to v_revenue_schedule that counts AIG Member +
-- Pledged deals as committed, dated inflows at full value — the in-between
-- between "ask" and "received". This must NOT sweep in the 200+ closedwon deals
-- (also "steward"), which already become gifts. The mapped stage can't tell them
-- apart, so we persist the RAW HubSpot dealstage on opportunities.external_stage
-- (kept current by the sync) and filter the view on it — keeping the view's
-- contract intact ("pipeline comes from opportunities", never hs_deals).
--
-- Handoff is automatic: when a commitment is paid, the HubSpot deal moves to
-- closedwon → it leaves this branch (no longer AIG/Pledged) and becomes a gift,
-- so it is never double-counted. Only future-dated rows are surfaced, matching
-- the weighted-pipeline branch.
--
-- Idempotent. Apply via the Supabase dashboard. Re-run fr_sync_hubspot_to_spine()
-- after applying (or rely on the next scheduled sync) to populate external_stage.

-- ── 1. Persist the raw HubSpot dealstage on opportunities ────────────────────
alter table public.opportunities add column if not exists external_stage text;

-- ── 2. Sync writes external_stage ───────────────────────────────────────────
-- Faithful CREATE OR REPLACE of the live function (fr_sync_exclude_partnership_
-- pipeline.sql) with external_stage added to step 3's insert/select/on-conflict;
-- every other step is verbatim. search_path re-pinned (CREATE OR REPLACE drops
-- SET clauses) to match pin_function_search_path.sql.
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

  -- 3. Deals → opportunities (granular stage + pipeline); upsert so stage moves
  --    propagate. external_stage keeps the RAW HubSpot dealstage so finance can
  --    distinguish committed stages (AIG Member, Pledged) from closedwon without
  --    reading hs_deals. Partnership-pipeline deals ('59855776') live in
  --    `partners`, not here — skip them.
  insert into opportunities (org_id, constituent_id, name, stage, external_stage, ask_amount,
                             expected_close, probability, pipeline, external_source, external_id)
  select d.org_id, coalesce(pc.id, oc.id), d.name,
         fr_map_dealstage(d.stage), d.stage, d.amount, d.close_date,
         fr_stage_probability(fr_map_dealstage(d.stage)), d.pipeline,
         'hubspot', d.hubspot_id
  from hs_deals d
  left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
  left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
  where d.pipeline is distinct from '59855776'
  on conflict (external_source, external_id) where external_id is not null
  do update set stage = excluded.stage, external_stage = excluded.external_stage,
                ask_amount = excluded.ask_amount,
                expected_close = excluded.expected_close, pipeline = excluded.pipeline,
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

-- ── 3. Backfill external_stage for already-synced opportunities ──────────────
update public.opportunities o
set external_stage = d.stage
from public.hs_deals d
where d.hubspot_id = o.external_id
  and o.external_source = 'hubspot'
  and o.external_stage is distinct from d.stage;

-- ── 4. v_revenue_schedule: add the committed-commitment branch ───────────────
-- Faithful CREATE OR REPLACE of create_revenue_schedule.sql's view with one new
-- UNION branch (commitments). All other branches are verbatim.
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
    and g.stage in ('awarded', 'active', 'closed')
    and not exists (
      select 1 from public.grant_payments gp
      where gp.grant_id = g.id and gp.status = 'scheduled'
    )

  union all

  -- open weighted pipeline: opportunities not lost/won, dated, with an ask.
  select
    o.org_id,
    'pipeline'::text,
    o.id,
    o.id,
    coalesce(o.name, 'Opportunity'),
    date_trunc('month', o.expected_close)::date,
    o.expected_close,
    o.ask_amount,
    round(o.ask_amount * coalesce(o.probability, 0) / 100.0, 2),
    'projected'::text,
    false,
    null::text,
    'open'::text,
    false
  from public.opportunities o
  where o.stage not in ('lost', 'steward')
    and o.expected_close >= current_date
    and o.ask_amount > 0

  union all

  -- committed commitments: HubSpot "AIG Member" (3448542950) and "Pledged"
  -- (59189578) deals — the donor has committed but the money hasn't landed yet.
  -- Counted at full value (committed), future-dated only. Filtered on the RAW
  -- dealstage so the 200+ closedwon deals (also mapped to "steward", and already
  -- turned into gifts) never appear here. When paid, the deal moves to closedwon,
  -- leaves this branch, and becomes a gift — no double count.
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
    and o.expected_close >= current_date
    and o.ask_amount > 0

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
  'Canonical dated schedule of expected inflows (pledges, grants, weighted pipeline, committed AIG/Pledged deals, manual). security_invoker — RLS of the underlying tables applies. Read by finance runway, the revenue/pledges pages, and Horizon. Never read hs_deals for finance numbers; pipeline + commitments come from opportunities.';

grant select on public.v_revenue_schedule to authenticated;
