-- BloomOS Messages: live delivery via Supabase Realtime.
--
-- Adds public.messages to the supabase_realtime publication so the client can
-- subscribe to INSERTs (postgres_changes) and render new messages instantly,
-- instead of waiting for the polling fallback. Row visibility is still gated by
-- the messages SELECT policy (members read thread messages) — a subscriber only
-- receives rows in threads they belong to. Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ── rollback ──────────────────────────────────────────────
-- alter publication supabase_realtime drop table public.messages;
