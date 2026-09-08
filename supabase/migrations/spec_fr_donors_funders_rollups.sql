-- BloomOS V2 / Spec Fundraising, stage F1 — public.v_fr_rollups, the
-- Donors & Funders read. (specs/bloomos-v2-spec-fundraising.md §Architecture)
--
-- One row per constituent with the three rollups the unified list renders:
-- lifetime giving (gifts), last touch (interactions), next move (the nearest
-- open opportunity's next_step). The spec's failure mode "Rollup cost" is
-- this view's reason to exist: 3,631 constituents × 55k interactions must
-- never be paged into JS per request — the aggregation runs set-based in the
-- database and the page reads one filtered, server-paginated slice.
--
-- security_invoker = on IS MANDATORY: constituents, gifts, interactions,
-- opportunities and recurring_plans all carry org-scoped RLS via
-- private.has_permission(org_id, 'fundraising.read'); running as invoker
-- applies those gates per caller. A plain (definer) view would merge
-- tenants. Verified by supabase/tests/rls-leak-test.sql.
--
-- Deliberately NOT in the view:
--   - "lapsed" — a rule in code, never a stored flag (spec decision 3,
--     signed): lib/fundraising/views.ts derives it from last_gift.
--   - fr_prospects — different id space. Un-promoted prospects render only
--     in the Prospects view, read straight from their table (spec §The
--     one-list rule); putting them here would fake a constituent identity.
--   - year-scoped totals — the V1 donors page's year filter stays V1's; the
--     unified list is a lifetime surface, and Donor 360 (F2) owns per-year
--     giving detail.

create or replace view public.v_fr_rollups
with (security_invoker = on) as
select
  c.id,
  c.org_id,
  c.type,
  c.first_name,
  c.last_name,
  c.org_name,
  c.emails,
  c.tags,
  c.do_not_contact,
  c.archived_at,
  coalesce(g.lifetime_total, 0)::numeric as lifetime_total,
  coalesce(g.gift_count, 0)::int         as gift_count,
  g.first_gift,
  g.last_gift,
  i.last_touch,
  o.next_step,
  o.next_step_due,
  (r.constituent_id is not null)         as recurring_active
from public.constituents c
left join (
  select constituent_id, org_id,
         sum(amount)    as lifetime_total,
         count(*)       as gift_count,
         min(gift_date) as first_gift,
         max(gift_date) as last_gift
  from public.gifts
  where constituent_id is not null
  group by constituent_id, org_id
) g on g.constituent_id = c.id and g.org_id = c.org_id
left join (
  select constituent_id, org_id, max(occurred_at) as last_touch
  from public.interactions
  group by constituent_id, org_id
) i on i.constituent_id = c.id and i.org_id = c.org_id
left join (
  -- The nearest open ask's next step: soonest dated step first, undated
  -- steps by recency. steward/lost are closed stages (V1 pipeline math).
  select distinct on (constituent_id, org_id)
         constituent_id, org_id, next_step, next_step_due
  from public.opportunities
  where stage not in ('steward', 'lost')
  order by constituent_id, org_id, next_step_due asc nulls last, updated_at desc
) o on o.constituent_id = c.id and o.org_id = c.org_id
left join (
  select distinct constituent_id, org_id
  from public.recurring_plans
  where status = 'active' and constituent_id is not null
) r on r.constituent_id = c.id and r.org_id = c.org_id;

grant select on public.v_fr_rollups to authenticated;
