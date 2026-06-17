-- Ongoing HubSpot → spine sync (supersedes the one-time import_hubspot_to_constituents).
-- Re-runnable + idempotent: called after every hs_* refresh by the sync job.
-- Mapping centralized here; lib/hubspot/stage-map.ts mirrors it for the UI.
--
-- Decisions (specs/fundraising-v2.md, Reconciliation update 2026-06-17):
--   * Ongoing sync stays on (HubSpot is NOT frozen).
--   * HubSpot closedwon deals are the gift source of record; payment gifts
--     (Stripe/Givebutter) are deduped against deal-gifts so nothing is
--     counted twice.
--   * Deals already imported as grants are excluded from gift creation.
--   * AIG membership is a constituent tag, not a deal stage.

alter table opportunities add column if not exists pipeline text;

-- HubSpot dealstage id → BloomOS moves-funnel stage
create or replace function fr_map_dealstage(hs_stage text)
returns text language sql immutable as $$
  select case hs_stage
    when '68574501' then 'identify'     -- Identified (Sales)
    when '117779885' then 'identify'    -- Prospective Partner
    when '1060753811' then 'identify'   -- Identified (Angel)
    when '1060753814' then 'identify'   -- Big 3 ID'd
    when '1060753815' then 'identify'   -- LinkedIn Mined
    when '3448542949' then 'qualify'    -- Researched
    when '59213864' then 'qualify'      -- Needs Appointment
    when 'appointmentscheduled' then 'cultivate'
    when '3448542951' then 'cultivate'  -- On Hold
    when '117779886' then 'cultivate'   -- Meeting Scheduled
    when '117779887' then 'cultivate'   -- Needs Follow-Up
    when '1060753812' then 'cultivate'  -- Pitched
    when '1060753816' then 'cultivate'  -- Outreach Sent
    when '1060753817' then 'cultivate'  -- Meetings Scheduled w/ Connections
    when '3448504042' then 'solicit'    -- Meeting Complete/Ready for Ask
    when '68574502' then 'solicit'      -- Ask Made
    when '59189578' then 'solicit'      -- Pledged
    when '1063539272' then 'solicit'    -- Proposed
    when '1064297317' then 'solicit'    -- Pending MOU Approval
    when '3448542950' then 'steward'    -- AIG Member
    when 'closedwon' then 'steward'
    when '117779888' then 'steward'     -- Partnership Established
    when '117779889' then 'steward'     -- Post-partnership Follow-Up
    when '1060753813' then 'steward'    -- Committed
    when 'closedlost' then 'lost'
    when '117779890' then 'lost'        -- Not Interested
    else 'cultivate'
  end
$$;

create or replace function fr_stage_probability(stage text)
returns int language sql immutable as $$
  select case stage
    when 'identify' then 10 when 'qualify' then 25 when 'cultivate' then 40
    when 'solicit' then 75 when 'steward' then 100 when 'lost' then 0 else 40 end
$$;

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

  -- 3. Deals → opportunities (granular stage + pipeline); upsert so stage moves propagate
  insert into opportunities (org_id, constituent_id, name, stage, ask_amount, expected_close,
                             probability, pipeline, external_source, external_id)
  select d.org_id, coalesce(pc.id, oc.id), d.name,
         fr_map_dealstage(d.stage), d.amount, d.close_date,
         fr_stage_probability(fr_map_dealstage(d.stage)), d.pipeline,
         'hubspot', d.hubspot_id
  from hs_deals d
  left join constituents pc on pc.external_ids->>'hubspot' = d.primary_contact_id
  left join constituents oc on oc.external_ids->>'hubspot_company' = d.primary_company_id
  where coalesce(pc.id, oc.id) is not null
  on conflict (external_source, external_id) where external_id is not null
  do update set stage = excluded.stage, ask_amount = excluded.ask_amount,
                expected_close = excluded.expected_close, pipeline = excluded.pipeline,
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
