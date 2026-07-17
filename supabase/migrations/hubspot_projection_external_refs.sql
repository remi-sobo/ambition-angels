-- Import layer (spec #5, E5): the HubSpot projection writes external_refs.
--
-- Provenance convergence, zero reader changes. fr_sync_hubspot_to_spine()
-- already stamps per-row provenance as it projects the hs_* mirror into the
-- spine (constituents.external_ids->>'hubspot'/'hubspot_company',
-- opportunities/gifts (external_source, external_id)). The new section 7
-- mirrors those stamps into the external_refs ledger so HubSpot-created rows
-- carry the same uniform provenance as file imports. It is DERIVED and
-- idempotent (insert … on conflict do nothing over the stamps themselves),
-- which means it also converges the entire historical backlog on every sync
-- run — not just rows created after this lands.
--
-- Interactions are deliberately NOT ledgered: their own composite unique
-- index (external_source, external_id, constituent_id) already provides
-- their dedupe/provenance, and mirroring 55k+ engagement rows into
-- external_refs would bloat the ledger for no lookup we perform.
--
-- Sections 1–6 are a faithful CREATE OR REPLACE of the live definition
-- (fundraising_pipeline_remap.sql generation — pipeline_stages-aware).

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
