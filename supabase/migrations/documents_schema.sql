-- Documents as a first-class linked system — Phase 1 (specs: BloomOS V3 #2).
--
-- One `documents` row per file, one `document_links` row per attachment to any
-- registry entity. Generalizes the working ask_documents/bloomos-asks pattern
-- org-wide. ask_documents itself is NOT migrated in v1 (open decision A):
-- fundraising keeps its table; the hub surfaces both; consolidation is a
-- tracked follow-on.
--
-- Security model (open decision B, confirmed against the bloomos-asks recon):
-- the metadata row is the boundary. The bucket is private, reached only
-- server-side; a file is served only after the caller passes RLS on its
-- documents row, then the server signs a short-TTL URL per request. Paths are
-- namespaced {org_id}/{document_id}/{filename} so a leaked raw path can't
-- enumerate another tenant and a later move to storage RLS needs no file moves.
--
-- The bucket itself (bloomos-documents, public=false) is created in the
-- Supabase dashboard / storage API, not in this migration — storage.buckets
-- doesn't exist on the scratch Postgres the RLS harness runs against:
--   insert into storage.buckets (id, name, public)
--   values ('bloomos-documents','bloomos-documents', false)
--   on conflict (id) do nothing;
--
-- Board access is LINK-SCOPED, not role-granted: board_viewer gets no
-- documents.read seed. Instead the read policies carve out documents that are
-- (a) org-visible and (b) linked to a board_meeting, for holders of
-- board.read. HR files and donor notes stay invisible to the board by
-- construction, not by a flag someone might forget.
--
-- org_id comes from session context on both tables — NO column default (the
-- ops_tasks '17c75da8-…' trap). A row inserted without session context fails
-- RLS rather than silently landing in AA.

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  storage_path  text not null,                  -- {org_id}/{id}/{safe_filename} in bloomos-documents
  filename      text not null,
  mime          text,
  size_bytes    bigint,
  title         text,                           -- human label; app defaults to filename
  doc_type      text,                           -- 'award_letter','mou','board_packet','policy',…
  status        text not null default 'active'
    check (status in ('active','archived','superseded')),
  visibility    text not null default 'org'
    check (visibility in ('org','restricted')), -- open decision E: coarse enum in v1
  version       int  not null default 1,        -- open decision D: counter + pointer, no tree
  supersedes_id uuid references public.documents(id),
  expires_at    date,                           -- feeds "expiring soon" + the renewal queue arm
  uploaded_by   uuid references public.profiles(user_id), -- uuid, NOT the ask_documents text mistake
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- document_links: many-to-many between a document and any registry entity.
-- entity_type is a real FK into the spine's entity_types registry; the
-- "target shares the document's org" invariant is enforced app-side before
-- insert (RLS can't see into an arbitrary target table) and backed by the
-- org_id column here matching both sides.
create table if not exists public.document_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  entity_type text not null references public.entity_types(entity_type),
  entity_id   uuid not null,
  created_by  uuid references public.profiles(user_id),
  created_at  timestamptz not null default now(),
  unique (document_id, entity_type, entity_id)
);

create index if not exists document_links_entity_idx
  on public.document_links (org_id, entity_type, entity_id);
create index if not exists document_links_document_idx
  on public.document_links (document_id);
create index if not exists documents_org_idx
  on public.documents (org_id, created_at desc);
create index if not exists documents_expiring_idx
  on public.documents (org_id, expires_at)
  where expires_at is not null and status = 'active';

alter table public.documents      enable row level security;
alter table public.document_links enable row level security;

-- Read: documents.read for org-visible rows; restricted rows additionally need
-- documents.admin. Board carve-out: an org-visible document linked to a board
-- meeting is readable by board.read holders (the portal path). The carve-out
-- deliberately excludes restricted documents.
drop policy if exists "read documents" on public.documents;
create policy "read documents" on public.documents
  for select to authenticated
  using (
    (
      (select private.has_permission(org_id, 'documents.read'))
      and ( visibility = 'org' or (select private.has_permission(org_id, 'documents.admin')) )
    )
    or (
      visibility = 'org'
      and (select private.has_permission(org_id, 'board.read'))
      and exists (
        select 1 from public.document_links l
        where l.document_id = documents.id and l.entity_type = 'board_meeting'
      )
    )
  );

drop policy if exists "write documents" on public.documents;
create policy "write documents" on public.documents
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'documents.write')) );

drop policy if exists "update documents" on public.documents;
create policy "update documents" on public.documents
  for update to authenticated
  using ( (select private.has_permission(org_id, 'documents.write')) )
  with check ( (select private.has_permission(org_id, 'documents.write')) );

drop policy if exists "delete documents" on public.documents;
create policy "delete documents" on public.documents
  for delete to authenticated
  using ( (select private.has_permission(org_id, 'documents.delete')) );

-- Links: readable with documents.read, or — for the board portal — when the
-- link itself targets a board meeting and the caller holds board.read.
drop policy if exists "read document_links" on public.document_links;
create policy "read document_links" on public.document_links
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'documents.read'))
    or ( entity_type = 'board_meeting' and (select private.has_permission(org_id, 'board.read')) )
  );

drop policy if exists "write document_links" on public.document_links;
create policy "write document_links" on public.document_links
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'documents.write')) );

drop policy if exists "delete document_links" on public.document_links;
create policy "delete document_links" on public.document_links
  for delete to authenticated
  using ( (select private.has_permission(org_id, 'documents.write')) );

-- Register 'document' in the spine's entity registry so tasks/comments can be
-- about a document and the resolver can label + link one. Route is the hub
-- (no per-document page in v1 — the pattern has no {id} on purpose).
insert into public.entity_types (entity_type, display_name, module, route_pattern, icon)
values ('document', 'Document', 'documents', '/admin/documents', 'file')
on conflict (entity_type) do nothing;

-- Permission seeds (data, not code) — entity_comments.sql convention.
-- board_viewer intentionally gets NO documents.* key: board document access is
-- link-scoped through the board.read carve-out above, never a blanket read.
insert into public.role_permissions (role, permission) values
  ('owner',   'documents.read'),
  ('owner',   'documents.write'),
  ('owner',   'documents.delete'),
  ('owner',   'documents.admin'),
  ('admin',   'documents.read'),
  ('admin',   'documents.write'),
  ('admin',   'documents.delete'),
  ('admin',   'documents.admin'),
  ('staff',   'documents.read'),
  ('staff',   'documents.write'),
  ('finance', 'documents.read'),
  ('finance', 'documents.write')
on conflict do nothing;

-- Spine integration: active documents with an expiry surface as renewal items
-- in the unified queue (recon question 7 — the arm is RLS-safe because the
-- view is security_invoker, so the documents read policy above applies per
-- caller). Recreates v_action_items with the sixth arm; everything else is
-- unchanged from spine_action_items_view.sql.
create or replace view public.v_action_items
with (security_invoker = on) as

  select t.org_id,
         'ops_task'::text                as source,
         t.id                            as source_id,
         t.title                         as title,
         t.linked_entity_type            as entity_type,
         t.linked_entity_id              as entity_id,
         t.linked_label                  as entity_label,
         t.assigned_to                   as owner_ref,
         t.due_date                      as due_date,
         coalesce(t.priority, 'medium')  as priority,
         t.status                        as status,
         'ops'::text                     as module
  from public.ops_tasks t
  where t.status <> 'done'
    and t.archived_at is null

  union all
  select r.org_id, 'grant_requirement', r.id,
         initcap(replace(coalesce(nullif(r.label, ''), r.kind), '_', ' ')),
         'grant', r.grant_id, null, null,
         r.due_date, 'high', r.status, 'fundraising'
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')

  union all
  select c.org_id, 'compliance_item', c.id, c.title,
         'compliance_item', c.id, c.title, c.assigned_to,
         c.due_date, 'high', c.status, 'compliance'
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')

  union all
  select g.org_id, 'acknowledgment', g.id, 'Thank-you due',
         'gift', g.id, null, null,
         g.gift_date, 'high', 'pending', 'fundraising'
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  select f.org_id, 'reconciliation_item', f.id, f.title,
         null, null, null, null,
         null::date, 'medium', f.status, 'finance'
  from public.fin_reconciliation_items f
  where f.status = 'pending'

  union all
  -- Documents with an expiry: renewal work, due on the expiry date.
  select d.org_id, 'document_renewal', d.id,
         'Renew: ' || coalesce(nullif(d.title, ''), d.filename),
         'document', d.id,
         coalesce(nullif(d.title, ''), d.filename), null,
         d.expires_at, 'medium', d.status, 'documents'
  from public.documents d
  where d.status = 'active'
    and d.expires_at is not null;

grant select on public.v_action_items to authenticated;
