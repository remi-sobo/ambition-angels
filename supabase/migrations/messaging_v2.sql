-- BloomOS Messages v2: edits, deletes, reactions, read receipts, and the
-- Realtime publication entries that make all of them (plus badges) live.
--
-- Additive. See docs/bloomos/messaging-spec.md.

-- ── Edits & soft deletes on messages ──────────────────────────────────────
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

-- ── Reactions ─────────────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  org_id     uuid not null references public.orgs on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

-- read: reactions on messages in a thread you belong to
drop policy if exists "members read reactions" on public.message_reactions;
create policy "members read reactions"
  on public.message_reactions for select
  using (
    (select private.has_permission(org_id, 'messages.read'))
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (select private.is_thread_member(m.thread_id, auth.uid()))
    )
  );

-- add your own reaction (only in threads you're in)
drop policy if exists "members add reactions" on public.message_reactions;
create policy "members add reactions"
  on public.message_reactions for insert
  with check (
    user_id = auth.uid()
    and (select private.has_permission(org_id, 'messages.write'))
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (select private.is_thread_member(m.thread_id, auth.uid()))
    )
  );

-- remove your own reaction
drop policy if exists "members remove own reactions" on public.message_reactions;
create policy "members remove own reactions"
  on public.message_reactions for delete
  using (user_id = auth.uid());

-- ── Realtime publication ──────────────────────────────────────────────────
-- messages was added in messaging_realtime.sql. Add the rest so edits/deletes
-- (messages UPDATE), reactions, read receipts (member last_read_at UPDATE), and
-- the Inbox badge (notifications INSERT) all arrive live. Row visibility is
-- still gated by each table's SELECT policy.
do $$
declare t text;
begin
  foreach t in array array['notifications','message_reactions','message_thread_members']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── rollback ──────────────────────────────────────────────
-- alter table public.messages drop column if exists edited_at;
-- alter table public.messages drop column if exists deleted_at;
-- drop table if exists public.message_reactions cascade;
-- alter publication supabase_realtime drop table public.notifications;
-- alter publication supabase_realtime drop table public.message_reactions;
-- alter publication supabase_realtime drop table public.message_thread_members;
