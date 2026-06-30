-- BloomOS Messages: team DM + group messaging.
-- See docs/bloomos/messaging-spec.md for the design and rationale.
--
-- Additive only. Three org-scoped tables (threads / members / messages), an
-- RLS membership helper that mirrors private.is_org_member (SECURITY DEFINER
-- breaks the self-reference recursion on message_thread_members), and the
-- messages.read / messages.write permission keys. All real writes go through
-- the service role in lib/messaging/threads.ts after an explicit auth +
-- membership check; these policies are the defense-in-depth backstop, exactly
-- as notify() relates to the notifications spine.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs on delete cascade,
  is_group        boolean not null default false,
  title           text,
  -- min(uid):max(uid) for DMs (null for groups). The partial unique index
  -- below makes opening a DM with someone resolve to one canonical thread.
  dm_key          text,
  created_by      uuid references auth.users on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index if not exists message_threads_dm_key_idx
  on public.message_threads (org_id, dm_key)
  where dm_key is not null;

create index if not exists message_threads_org_recent_idx
  on public.message_threads (org_id, last_message_at desc);

create table if not exists public.message_thread_members (
  thread_id    uuid not null references public.message_threads on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  org_id       uuid not null references public.orgs on delete cascade,
  last_read_at timestamptz,
  added_at     timestamptz not null default now(),
  primary key (thread_id, user_id)
);

-- "threads I'm in", and the reverse lookup for membership checks
create index if not exists message_thread_members_user_idx
  on public.message_thread_members (user_id);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.message_threads on delete cascade,
  org_id     uuid not null references public.orgs on delete cascade,
  sender_id  uuid not null references auth.users on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- feed: a thread's messages oldest-first; also serves the after-cursor poll
create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at);

-- ── Membership helper (SECURITY DEFINER → no RLS recursion) ───────────────

create or replace function private.is_thread_member(p_thread uuid, p_user uuid)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1 from public.message_thread_members
    where thread_id = p_thread and user_id = p_user
  );
$$;

grant execute on function private.is_thread_member(uuid, uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table public.message_threads        enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.messages               enable row level security;

-- threads: read the ones you're in; open a new one as yourself
drop policy if exists "members read their threads" on public.message_threads;
create policy "members read their threads"
  on public.message_threads for select
  using (
    (select private.has_permission(org_id, 'messages.read'))
    and (select private.is_thread_member(id, auth.uid()))
  );

drop policy if exists "members open threads" on public.message_threads;
create policy "members open threads"
  on public.message_threads for insert
  with check (
    created_by = auth.uid()
    and (select private.has_permission(org_id, 'messages.write'))
  );

-- a member may touch the thread row (title rename, last_message_at bump)
drop policy if exists "members update their threads" on public.message_threads;
create policy "members update their threads"
  on public.message_threads for update
  using ((select private.is_thread_member(id, auth.uid())))
  with check ((select private.is_thread_member(id, auth.uid())));

-- thread members: see the roster of any thread you're in; manage your own row
drop policy if exists "members read thread roster" on public.message_thread_members;
create policy "members read thread roster"
  on public.message_thread_members for select
  using ((select private.is_thread_member(thread_id, auth.uid())));

drop policy if exists "members update own membership" on public.message_thread_members;
create policy "members update own membership"
  on public.message_thread_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- messages: read in your threads; send as yourself in your threads
drop policy if exists "members read thread messages" on public.messages;
create policy "members read thread messages"
  on public.messages for select
  using (
    (select private.has_permission(org_id, 'messages.read'))
    and (select private.is_thread_member(thread_id, auth.uid()))
  );

drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (select private.has_permission(org_id, 'messages.write'))
    and (select private.is_thread_member(thread_id, auth.uid()))
  );

-- ── Permission keys ───────────────────────────────────────────────────────
-- Without these has_permission returns false and the messenger is silently
-- empty. board_viewer is intentionally excluded — guests don't get the team
-- messenger.
insert into public.role_permissions (role, permission) values
  ('owner','messages.read'),
  ('admin','messages.read'),
  ('staff','messages.read'),
  ('finance','messages.read'),
  ('owner','messages.write'),
  ('admin','messages.write'),
  ('staff','messages.write'),
  ('finance','messages.write')
on conflict do nothing;

-- ── rollback ──────────────────────────────────────────────
-- drop table public.messages cascade;
-- drop table public.message_thread_members cascade;
-- drop table public.message_threads cascade;
-- drop function if exists private.is_thread_member(uuid, uuid);
-- delete from public.role_permissions
--   where permission in ('messages.read','messages.write');
