-- Resolve HubSpot companies through the external_refs provenance ledger.
--
-- Constituent merges (merge_duplicate_hubspot_org_constituents.MANUAL.sql)
-- archive a duplicate org and repoint its external_refs row — carrying its
-- HubSpot company id — to the surviving constituent, while the archived
-- row's external_ids key is renamed so live lookups stop resolving it.
-- Before this migration, fr_sync_hubspot_to_spine only consulted
-- constituents.external_ids->>'hubspot_company', so the next sync after a
-- merge would (a) re-insert the merged-away company as a fresh unarchived
-- duplicate (section 1's not-exists guard no longer matched) and (b) keep
-- attaching that company's deals to nothing. Found by review on PR #454.
--
-- Fix, three edits to the live definition (hubspot_projection_dedupe_pushed_deals
-- generation), everything else a faithful CREATE OR REPLACE:
--   1. Section 1 also skips companies whose id is claimed in external_refs
--      (entity_type 'constituent', source 'hubspot_company').
--   2. Sections 3, 4 and 5 resolve a deal's primary company via
--      external_refs first, falling back to external_ids — so a merged
--      company's deals attach to the SURVIVOR, and a company inserted by
--      section 1 in the same run (no ref row until section 7) still
--      resolves.
--
-- Must be applied BEFORE the MANUAL merge is run by hand, so no sync can
-- slip between merge and fix; migrations deploy with the PR, the MANUAL
-- file is run afterwards, so normal order satisfies this.

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
    and not exists (select 1 from constituents x where x.external_ids->>'hubspot_company' = c.hubspot_id)
    -- The provenance ledger also claims ids: a merged-away duplicate's company
    -- id is repointed to the surviving constituent in external_refs, and must
    -- not be re-imported as a fresh org (merge_duplicate_hubspot_org_constituents).
    and not exists (select 1 from external_refs er
                    where er.org_id = c.org_id
                      and er.entity_type = 'constituent' and er.source = 'hubspot_company'
                      and er.external_id = c.hubspot_id);

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

  -- 3a. Provenance convergence for Bloom-native asks pushed to HubSpot:
  --     adopt the deal id sync-out stamped into external_ids.hubspot_deal as
  --     this row's (external_source, external_id), so the deal upsert below
  --     UPDATES the original ask instead of inserting a duplicate. Oldest row
  --     wins when several share a deal id; ids already claimed by a
  --     hubspot-sourced row are skipped (the partial unique index stays safe).
  update opportunities o
  set external_source = 'hubspot',
      external_id = o.external_ids->>'hubspot_deal',
      updated_at = now()
  from (
    select distinct on (external_ids->>'hubspot_deal') id
    from opportunities
    where external_source is null
      and coalesce(external_ids->>'hubspot_deal', '') <> ''
    order by external_ids->>'hubspot_deal', created_at asc
  ) pick
  where o.id = pick.id
    and not exists (
      select 1 from opportunities x
      where x.external_source = 'hubspot'
        and x.external_id = o.external_ids->>'hubspot_deal');

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
  left join lateral (
    select coalesce(
      (select er.entity_id from external_refs er
        where er.org_id = d.org_id
          and er.entity_type = 'constituent' and er.source = 'hubspot_company'
          and er.external_id = d.primary_company_id
        limit 1),
      (select cx.id from constituents cx
        where cx.external_ids->>'hubspot_company' = d.primary_company_id
        limit 1)) as id
  ) oc on true
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
  left join lateral (
    select coalesce(
      (select er.entity_id from external_refs er
        where er.org_id = d.org_id
          and er.entity_type = 'constituent' and er.source = 'hubspot_company'
          and er.external_id = d.primary_company_id
        limit 1),
      (select cx.id from constituents cx
        where cx.external_ids->>'hubspot_company' = d.primary_company_id
        limit 1)) as id
  ) oc on true
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
      left join lateral (
    select coalesce(
      (select er.entity_id from external_refs er
        where er.org_id = d.org_id
          and er.entity_type = 'constituent' and er.source = 'hubspot_company'
          and er.external_id = d.primary_company_id
        limit 1),
      (select cx.id from constituents cx
        where cx.external_ids->>'hubspot_company' = d.primary_company_id
        limit 1)) as id
  ) oc on true
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

  -- 7. Provenance ledger (import layer, spec #5 E5). Derived from the stamps
  --    sections 1–4 leave on the rows themselves, so it converges history and
  --    new rows alike; the unique key makes every pass a cheap no-op after
  --    the first.
  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  select x.org_id, 'constituent', x.id, 'hubspot', x.external_ids->>'hubspot'
  from constituents x
  where x.external_ids ? 'hubspot'
  on conflict (org_id, entity_type, source, external_id) do nothing;

  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  select x.org_id, 'constituent', x.id, 'hubspot_company', x.external_ids->>'hubspot_company'
  from constituents x
  where x.external_ids ? 'hubspot_company'
  on conflict (org_id, entity_type, source, external_id) do nothing;

  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  select o.org_id, 'opportunity', o.id, 'hubspot', o.external_id
  from opportunities o
  where o.external_source = 'hubspot' and o.external_id is not null
  on conflict (org_id, entity_type, source, external_id) do nothing;

  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  select g.org_id, 'gift', g.id, 'hubspot_deal', g.external_id
  from gifts g
  where g.external_source = 'hubspot_deal' and g.external_id is not null
  on conflict (org_id, entity_type, source, external_id) do nothing;
end;
$function$;
