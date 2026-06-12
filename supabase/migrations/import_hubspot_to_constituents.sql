-- BloomOS Ring 2: one-time HubSpot importer (roadmap: "HubSpot frozen").
--
-- Maps the synced HubSpot mirror onto the fundraising spine:
--   hs_companies    → organization constituents (external_ids.hubspot_company)
--   hs_contacts     → person constituents (external_ids.hubspot); existing
--                     constituents (e.g. Stripe donors) are matched by email
--                     and stamped with their HubSpot id instead of duplicated
--   hs_deals        → opportunities (closedwon → steward, closedlost → lost,
--                     anything else → cultivate); NEVER gifts — deal amounts
--                     are asks/pledges, and fabricating gifts from CRM deals
--                     would double-count against Stripe's real money
--   hs_engagements  → interactions, one row per (engagement, known contact)
--
-- Idempotent and re-runnable: matching is by external ids, inserts are
-- conflict/exists-guarded, so re-running after another HubSpot sync imports
-- only the delta. The HubSpot mirror tables stay untouched (the prospect
-- research pages keep working); this just makes the spine the system of
-- record.

-- ── External keys for idempotent imports ────────────────────────────────

alter table opportunities add column if not exists external_source text;
alter table opportunities add column if not exists external_id text;
create unique index if not exists opportunities_external_idx
  on opportunities (external_source, external_id)
  where external_id is not null;

alter table interactions add column if not exists external_source text;
alter table interactions add column if not exists external_id text;
-- One engagement fans out to several constituents; uniqueness is per pair.
create unique index if not exists interactions_external_idx
  on interactions (external_source, external_id, constituent_id)
  where external_id is not null;

-- Join accelerator for "constituent by HubSpot id".
create index if not exists constituents_hubspot_idx
  on constituents ((external_ids->>'hubspot'))
  where external_ids ? 'hubspot';

-- ── 1. Companies → organization constituents ────────────────────────────

insert into constituents (org_id, type, org_name, source, external_ids)
select c.org_id, 'organization', c.name, 'hubspot_import',
       jsonb_build_object('hubspot_company', c.hubspot_id)
from hs_companies c
where c.name is not null and c.name <> ''
  and not exists (
    select 1 from constituents x
    where x.external_ids->>'hubspot_company' = c.hubspot_id
  );

-- ── 2a. Stamp HubSpot ids onto existing constituents (email match) ──────

update constituents x
set external_ids = x.external_ids || jsonb_build_object('hubspot', h.hubspot_id),
    source = case when x.source = 'manual' then 'hubspot_import' else x.source end
from (
  select distinct on (lower(email)) hubspot_id, lower(email) as email
  from hs_contacts
  where email is not null and email <> ''
  order by lower(email), created_in_hubspot_at asc nulls last
) h
where not (x.external_ids ? 'hubspot')
  and x.type = 'person'
  and h.email = any (select lower(e) from unnest(x.emails) e);

-- ── 2b. Remaining contacts → new person constituents ────────────────────

insert into constituents (org_id, type, first_name, last_name, emails, phones, source, external_ids)
select c.org_id, 'person', c.first_name, c.last_name,
       case when c.email is not null and c.email <> ''
            then array[lower(c.email)] else '{}'::text[] end,
       case when c.phone is not null and c.phone <> ''
            then array[c.phone] else '{}'::text[] end,
       'hubspot_import',
       jsonb_build_object('hubspot', c.hubspot_id)
from hs_contacts c
where (coalesce(c.first_name,'') <> '' or coalesce(c.last_name,'') <> ''
       or coalesce(c.email,'') <> '')
  and not exists (
    select 1 from constituents x where x.external_ids->>'hubspot' = c.hubspot_id
  )
  and not exists (
    -- Same-email contact already represented (first HubSpot id won in 2a).
    select 1 from constituents x
    where c.email is not null and c.email <> ''
      and lower(c.email) = any (select lower(e) from unnest(x.emails) e)
  );

-- ── 3. Deals → opportunities ─────────────────────────────────────────────

insert into opportunities (
  org_id, constituent_id, name, stage, ask_amount, expected_close,
  external_source, external_id
)
select d.org_id,
       coalesce(pc.id, oc.id),
       d.name,
       case when d.stage = 'closedwon' then 'steward'
            when d.stage = 'closedlost' then 'lost'
            else 'cultivate' end,
       d.amount,
       d.close_date,
       'hubspot', d.hubspot_id
from hs_deals d
left join constituents pc
  on pc.external_ids->>'hubspot' = d.primary_contact_id
left join constituents oc
  on oc.external_ids->>'hubspot_company' = d.primary_company_id
where coalesce(pc.id, oc.id) is not null
on conflict (external_source, external_id) where external_id is not null
do nothing;

-- ── 4. Engagements → interactions ────────────────────────────────────────

insert into interactions (
  org_id, constituent_id, kind, occurred_at, notes, logged_by,
  external_source, external_id
)
select e.org_id,
       x.id,
       case
         when e.engagement_type ilike '%email%' then 'email'
         when e.engagement_type ilike 'call%'   then 'call'
         when e.engagement_type ilike 'meeting%' then 'meeting'
         else 'note'
       end,
       coalesce(e.occurred_at, e.created_at),
       nullif(trim(coalesce(e.subject,'') ||
         case when coalesce(e.body_preview,'') <> ''
              then ' — ' || e.body_preview else '' end), ''),
       'hubspot',
       'hubspot', e.hubspot_id
from hs_engagements e
cross join lateral unnest(e.contact_ids) as cid
join constituents x on x.external_ids->>'hubspot' = cid
on conflict (external_source, external_id, constituent_id) where external_id is not null
do nothing;
