-- Make the BloomOS pipeline board reflect HubSpot deal flow 1:1.
--
-- Problem: fr_sync_hubspot_to_spine() only created an opportunity when a deal
-- was associated with a contact/company that already existed as a constituent
-- (the `where coalesce(pc.id, oc.id) is not null` filter). Deals entered in
-- HubSpot with no primary contact/company — many foundations, grants, and
-- individual gifts (Oakland Promise, NFL Players Foundation, etc.) — were
-- silently dropped, so the board under-counted HubSpot by ~57 deals.
--
-- Fix: project EVERY deal. When a deal has no linked constituent we still
-- create the opportunity with constituent_id = null; the board card falls back
-- to the deal name (opportunities.name). This requires constituent_id to be
-- nullable. Closed-lost deals are kept in the table (stage = 'lost') but hidden
-- from the board in the UI.
--
-- Stage mapping (fr_map_dealstage) is unchanged and still mirrored in
-- lib/hubspot/stage-map.ts — see that file for the full HubSpot-stage → funnel
-- table.

alter table opportunities alter column constituent_id drop not null;

create or replace function fr_sync_hubspot_to_spine()
returns void language plpgsql as $$
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
  --    propagate. Deals with NO linked contact/company still project, with
  --    constituent_id = null, so nothing in HubSpot is silently dropped from
  --    the board — the card falls back to the deal name. If such a deal later
  --    gets a contact in HubSpot, the next sync fills constituent_id without
  --    clobbering a link that already exists.
  insert into opportunities (org_id, constituent_id, name, stage, ask_amount, expected_close,
                             probability, pipeline, external_source, external_id)
  select d.org_id, coalesce(pc.id, oc.id), d.name,
         fr_map_dealstage(d.stage), d.amount, d.close_date,
         fr_stage_probability(fr_map_dealstage(d.stage)), d.pipeline,
         'hubspot', d.hubspot_id
  from hs_deals d
  left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
  left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
  on conflict (external_source, external_id) where external_id is not null
  do update set stage = excluded.stage, ask_amount = excluded.ask_amount,
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
$$;
