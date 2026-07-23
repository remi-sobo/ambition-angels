-- Org-scope the fuzzy people-search RPC (cross-org leak fix).
--
-- bloomos_search_people ran as SECURITY INVOKER with RLS as its only fence,
-- but RLS admits rows from EVERY org the caller belongs to — a multi-org user
-- searching from one org could surface constituents/prospects from another.
-- Replace the two-arg function with a version that takes the caller's ACTIVE
-- org id and filters both branches by it (the API passes ctx.orgId). Still
-- SECURITY INVOKER, so RLS continues to apply on top — the org argument can
-- only narrow, never widen, what the caller sees.

-- The scratch-DB CI runner (scripts/test-rls.sh) has no pg_trgm / extensions
-- schema (see the bloomos_global_search_phase3.sql exclusion there), so skip
-- SQL-body validation at create time; production has both installed.
set check_function_bodies = off;

-- Drop the unscoped signature so the leaky variant is no longer callable.
drop function if exists public.bloomos_search_people(text, int);

create or replace function public.bloomos_search_people(q text, org uuid, lim int default 6)
returns table (id uuid, kind text, name text, org_name text, email text, sim real)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select * from (
    select
      c.id,
      'constituent'::text as kind,
      case when c.type = 'organization' then coalesce(c.org_name, '')
           else trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) end as name,
      c.org_name,
      c.emails[1] as email,
      greatest(
        similarity(coalesce(c.first_name,''), q),
        similarity(coalesce(c.last_name,''), q),
        similarity(coalesce(c.org_name,''), q),
        similarity(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), q)
      ) as sim
    from public.constituents c
    where c.org_id = org
      and c.archived_at is null
      and (c.first_name % q or c.last_name % q or c.org_name % q
           or trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) % q)
    union all
    select
      p.id,
      'prospect'::text as kind,
      p.name,
      p.org_name,
      p.email,
      greatest(similarity(coalesce(p.name,''), q), similarity(coalesce(p.org_name,''), q)) as sim
    from public.fr_prospects p
    where p.org_id = org
      and p.status <> 'disqualified'
      and (p.name % q or p.org_name % q)
  ) cands
  order by sim desc
  limit lim;
$$;

grant execute on function public.bloomos_search_people(text, uuid, int) to authenticated, anon;
-- service_role only exists on the Supabase platform, not the scratch runner.
do $$ begin
  grant execute on function public.bloomos_search_people(text, uuid, int) to service_role;
exception when undefined_object then null; end $$;
alter function public.bloomos_search_people(text, uuid, int) set search_path = public, extensions, pg_temp;
