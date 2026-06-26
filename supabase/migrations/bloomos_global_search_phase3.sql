-- BloomOS global search Phase 3: typo-tolerant (pg_trgm) people search + notes.
-- Additive and reversible: enables pg_trgm, adds trigram GIN indexes on the
-- name/notes columns search hits, and a SECURITY INVOKER people-search RPC
-- (RLS still applies — it can only return rows the caller could already read).
--
-- Applied to the live project (kzzdtibbwsucloaoqpqa) via the Supabase MCP on
-- the Phase 3 build; committed here so the schema change is in version control
-- alongside the rest of supabase/migrations.

create extension if not exists pg_trgm with schema extensions;

-- Typo tolerance on the columns global search matches against.
create index if not exists constituents_first_name_trgm on public.constituents using gin (first_name extensions.gin_trgm_ops);
create index if not exists constituents_last_name_trgm  on public.constituents using gin (last_name  extensions.gin_trgm_ops);
create index if not exists constituents_org_name_trgm   on public.constituents using gin (org_name   extensions.gin_trgm_ops);
create index if not exists fr_prospects_name_trgm       on public.fr_prospects using gin (name     extensions.gin_trgm_ops);
create index if not exists fr_prospects_org_name_trgm   on public.fr_prospects using gin (org_name extensions.gin_trgm_ops);
-- Notes search (interactions is large — 55k+ rows — so index it).
create index if not exists interactions_notes_trgm on public.interactions using gin (notes extensions.gin_trgm_ops);
create index if not exists ops_tasks_description_trgm on public.ops_tasks using gin (description extensions.gin_trgm_ops);

-- Fuzzy people search across the spine + prospect bench, ranked by trigram
-- similarity. Returns the union; the API merges it with the exact substring
-- matches and dedupes, so prefixes pg_trgm's 0.3 threshold would miss are still
-- caught by the substring path.
create or replace function public.bloomos_search_people(q text, lim int default 6)
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
    where c.archived_at is null
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
    where p.status <> 'disqualified'
      and (p.name % q or p.org_name % q)
  ) cands
  order by sim desc
  limit lim;
$$;

grant execute on function public.bloomos_search_people(text, int) to authenticated, anon, service_role;
alter function public.bloomos_search_people(text, int) set search_path = public, extensions, pg_temp;
