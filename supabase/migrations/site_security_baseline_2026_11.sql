-- Security baseline (security/baseline-2026-11). NOT APPLIED. Apply to the
-- Ambition Angels website database (sfmlktoeveovujjurihn) only after Remi's
-- yes. Idempotent: safe to run twice.
--
-- 1. ms_catalog is a SECURITY DEFINER view (owner postgres), so it reads
--    ms_cards/ms_occupations past RLS for whoever queries it, and anon and
--    authenticated hold SELECT on it. Supabase flags this as an ERROR. No
--    code in this repo reads ms_catalog with the anon key: every read of the
--    website database goes through the service role (lib/site/supabase.ts).
--    So: make it security_invoker, and take it away from anon/authenticated.
--    The service role keeps working because it bypasses RLS.
--    Check first that nothing outside this repo (the My Ambition app,
--    BloomOS) reads ms_catalog with an anon key.
alter view public.ms_catalog set (security_invoker = true);
revoke all on public.ms_catalog from anon, authenticated;

-- 2. set_updated_at is a trigger function (ms_cards, game_pool). Trigger
--    functions never need to be callable over the API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 3. Belt and braces: the base tables already have RLS on with no policies
--    and no grants to anon/authenticated (checked 2026-11-26). Keep it that way.
alter table if exists public.ms_cards       enable row level security;
alter table if exists public.ms_occupations enable row level security;
alter table if exists public.ms_sessions    enable row level security;
alter table if exists public.ms_explored    enable row level security;
alter table if exists public.ms_deliveries  enable row level security;
alter table if exists public.ms_rooms       enable row level security;
alter table if exists public.intake_outbox  enable row level security;
alter table if exists public.page_views     enable row level security;
alter table if exists public.click_events   enable row level security;
