-- Phase 1: notifications spine

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs on delete cascade,
  recipient_id        uuid not null references auth.users on delete cascade,
  actor_id            uuid references auth.users on delete set null,
  type                text not null,
  title               text not null,
  body                text,
  linked_entity_type  text,
  linked_entity_id    uuid,
  linked_label        text,
  url                 text,
  read_at             timestamptz,
  emailed_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- feed: recipient's notifications, newest first
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

-- fast unread count
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

-- read: only your own, and only while you still belong to the org
create policy "recipients read own notifications"
  on public.notifications for select
  using (
    recipient_id = auth.uid()
    and (select private.has_permission(org_id, 'notifications.read'))
  );

-- mark read: only your own
create policy "recipients update own notifications"
  on public.notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- insert backstop (notify() uses the service role and bypasses this; the
-- policy guards any future client-side insert path)
create policy "members create notifications"
  on public.notifications for insert
  with check ((select private.has_permission(org_id, 'notifications.write')));

-- register the permission keys, or has_permission returns false and the inbox
-- is silently empty
insert into public.role_permissions (role, permission) values
  ('owner','notifications.read'),
  ('admin','notifications.read'),
  ('staff','notifications.read'),
  ('finance','notifications.read'),
  ('board_viewer','notifications.read'),
  ('owner','notifications.write'),
  ('admin','notifications.write'),
  ('staff','notifications.write'),
  ('finance','notifications.write')
on conflict do nothing;

-- ── rollback ──────────────────────────────────────────────
-- drop table public.notifications cascade;
-- delete from public.role_permissions
--   where permission in ('notifications.read','notifications.write');
