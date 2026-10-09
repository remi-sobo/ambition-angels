-- Capture, stage C2 (specs/bloomos-capture.md, ruling 1): the name-match RPC
-- the parse route calls once per spoken span.
--
-- capture_match_candidates(q, org, lim) is a SECURITY INVOKER trigram search,
-- modeled on bloomos_search_people (search_people_org_scope.sql), over three
-- sources pinned to the caller's ACTIVE org:
--   constituents   kind 'constituent'  (person: first last; org: org_name)
--   partners       kind 'partner'      (partners.name)
--   fr_prospects   kind 'prospect'     (a disambiguation hint only; the
--                                       validator never files to a prospect)
-- RLS applies on top (invoker), so the org argument can only narrow what the
-- caller could already read. NEVER students, applications, cohort_members,
-- attendance, or imports: V1 stays out of youth data (spec Condition 2).
--
-- meta is the one-line disambiguator the card shows next to the name: the
-- constituent type plus the date of the most recent interaction (a lateral
-- max over the (constituent_id, occurred_at desc) index, cheap), or the
-- partner kind and city.
--
-- Guarded form from C1 on (spec, "Migration convention from C2 on"): no DROP
-- POLICY / DROP TRIGGER; create or replace; if-not-exists guards. The committed
-- file is exactly what the connector applies.
--
-- Apply via the Supabase connector's apply_migration with name
-- capture_match_rpc, after review. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- The scratch CI runner (scripts/test-rls.sh) has no pg_trgm, so SQL-body
-- validation is skipped at create time; production has it installed in the
-- `extensions` schema (bloomos_global_search_phase3.sql).
set check_function_bodies = off;

-- The leak test CALLS this function, so the scratch runner needs pg_trgm too.
-- Installed into the default schema only where it is absent (postgres:16 ships
-- the contrib module); a no-op in production, where it already lives in
-- `extensions`.
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create extension pg_trgm;
  end if;
end $$;

create or replace function public.capture_match_candidates(q text, org uuid, lim int default 5)
returns table (id uuid, kind text, name text, org_name text, meta text, sim real)
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
           else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end as name,
      c.org_name,
      (case when c.type = 'organization' then 'organization' else 'person' end
        || coalesce(' · last touch ' || to_char(li.last_at, 'Mon DD, YYYY'), '')) as meta,
      greatest(
        similarity(coalesce(c.first_name, ''), q),
        similarity(coalesce(c.last_name, ''), q),
        similarity(coalesce(c.org_name, ''), q),
        similarity(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), q)
      ) as sim
    from public.constituents c
    left join lateral (
      select max(i.occurred_at) as last_at
      from public.interactions i
      where i.constituent_id = c.id
    ) li on true
    where c.org_id = org
      and c.archived_at is null
      and (c.first_name % q or c.last_name % q or c.org_name % q
           or trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) % q)
    union all
    select
      p.id,
      'partner'::text as kind,
      p.name,
      null::text as org_name,
      nullif(concat_ws(' · ', nullif(p.kind, ''), nullif(p.city, '')), '') as meta,
      similarity(coalesce(p.name, ''), q) as sim
    from public.partners p
    where p.org_id = org
      and p.name % q
    union all
    select
      fp.id,
      'prospect'::text as kind,
      fp.name,
      fp.org_name,
      'prospect'::text as meta,
      greatest(similarity(coalesce(fp.name, ''), q), similarity(coalesce(fp.org_name, ''), q)) as sim
    from public.fr_prospects fp
    where fp.org_id = org
      and fp.status <> 'disqualified'
      and (fp.name % q or fp.org_name % q)
  ) cands
  order by sim desc
  limit lim;
$$;

-- Callable by signed-in members only (RLS does the row fencing); anon gets
-- nothing, not even an empty result.
revoke all on function public.capture_match_candidates(text, uuid, int) from public;
grant execute on function public.capture_match_candidates(text, uuid, int) to authenticated;
-- service_role only exists on the Supabase platform, not the scratch runner.
do $$ begin
  grant execute on function public.capture_match_candidates(text, uuid, int) to service_role;
exception when undefined_object then null; end $$;
