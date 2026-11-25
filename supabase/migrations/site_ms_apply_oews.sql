-- ms_apply_oews: bulk-apply BLS OEWS pay to ms_occupations (website database).
--
-- Called by the ms-refresh-oews edge function. Copied verbatim from BloomOS
-- production on 2026-11-23, where it existed with no migration file at all
-- (docs/schema-drift-audit.md). This file is now its recorded definition.
-- Service role only, as in BloomOS.

create or replace function public.ms_apply_oews(rows jsonb, vintage text)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with src as (
    select r->>'soc' as soc,
           nullif(r->>'median','')::int as median,
           nullif(r->>'p90','')::int as p90
    from jsonb_array_elements(rows) as r
  ),
  updated as (
    update ms_occupations o
    set pay_median = s.median,
        pay_p90 = s.p90,
        pay_as_of = vintage
    from src s
    where o.soc_code = s.soc
    returning 1
  )
  select count(*)::int from updated;
$function$;

revoke all on function public.ms_apply_oews(jsonb, text) from public, anon, authenticated;
grant execute on function public.ms_apply_oews(jsonb, text) to service_role;
