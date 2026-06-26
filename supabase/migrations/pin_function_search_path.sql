-- Security hardening: pin a non-mutable search_path on functions the Supabase
-- linter flags (function_search_path_mutable, lint 0011). All are SECURITY
-- INVOKER and reference public objects; 'public, extensions, pg_temp' preserves
-- resolution and is non-breaking + reversible (ALTER FUNCTION ... RESET search_path).

alter function public.set_updated_at() set search_path = public, extensions, pg_temp;
alter function public.demoday_notes_touch_updated_at() set search_path = public, extensions, pg_temp;
alter function public.fr_donations_after_update() set search_path = public, extensions, pg_temp;
alter function public.fr_ingest_donation(donations) set search_path = public, extensions, pg_temp;
alter function public.fr_ingest_donation_tg() set search_path = public, extensions, pg_temp;
alter function public.fr_map_dealstage(text) set search_path = public, extensions, pg_temp;
alter function public.fr_pursue_funder_angle(uuid, text) set search_path = public, extensions, pg_temp;
alter function public.fr_stage_probability(text) set search_path = public, extensions, pg_temp;
alter function public.fr_sync_hubspot_to_spine() set search_path = public, extensions, pg_temp;
alter function public.hubspot_bench_candidates(text, text, integer, integer) set search_path = public, extensions, pg_temp;
alter function public.hubspot_bench_candidates_count(text, text) set search_path = public, extensions, pg_temp;
