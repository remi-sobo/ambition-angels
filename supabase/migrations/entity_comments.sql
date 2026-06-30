-- Phase 4: anchored comments (entity_comments)
--
-- Org-shared, record-anchored threads. Unlike notifications (per-recipient),
-- comments are visible to anyone in the org with comments.read, so RLS uses
-- the standard has_permission() pattern (mirrors fr_prospects), not a
-- per-user filter.
--
-- author_id references auth.users, NOT profiles: a member can have a
-- membership without a profile row (no auto-create trigger), and auth.uid()
-- == profiles.user_id == memberships.user_id, so auth.users is the safe,
-- consistent identity (same choice as notifications.recipient_id/actor_id).

create table if not exists public.entity_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs on delete cascade,
  entity_type text not null,                 -- 'constituent', 'fr_prospects', later 'grant', 'task', …
  entity_id   uuid not null,                 -- the record the thread hangs on
  author_id   uuid not null references auth.users on delete cascade,
  body        text not null,                 -- plain text v1; @mentions parsed server-side in Phase 5
  parent_id   uuid references public.entity_comments on delete cascade,  -- threaded replies
  mentions    uuid[] not null default '{}',  -- resolved mentioned user_ids (Phase 5 populates)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                    -- soft delete; hide, don't hard-delete
);

-- thread feed for one record, oldest-first
create index if not exists entity_comments_entity_idx
  on public.entity_comments (entity_type, entity_id, created_at);

alter table public.entity_comments enable row level security;

-- read: any member with comments.read in the row's org
create policy "members read entity_comments"
  on public.entity_comments for select
  using ((select private.has_permission(org_id, 'comments.read')));

-- write (insert/update/delete): any member with comments.write in the row's org.
-- Author-only edit/delete is enforced in the app layer; RLS stays org-shared.
create policy "members write entity_comments"
  on public.entity_comments for all
  using ((select private.has_permission(org_id, 'comments.write')))
  with check ((select private.has_permission(org_id, 'comments.write')));

-- register the permission keys (single comments.* key for v1). Granted to the
-- roles that actually work constituent/prospect records — owner/admin/staff.
-- finance and board_viewer are left out: they have no fundraising.read, so
-- granting comments.read would let them read comments on records they can't
-- otherwise see (the "comment visibility broader than entity visibility"
-- trap). Revisit with per-entity-module keys if a tenant needs it.
insert into public.role_permissions (role, permission) values
  ('owner','comments.read'),
  ('admin','comments.read'),
  ('staff','comments.read'),
  ('owner','comments.write'),
  ('admin','comments.write'),
  ('staff','comments.write')
on conflict do nothing;

-- ── rollback ──────────────────────────────────────────────
-- drop table public.entity_comments cascade;
-- delete from public.role_permissions
--   where permission in ('comments.read','comments.write');
