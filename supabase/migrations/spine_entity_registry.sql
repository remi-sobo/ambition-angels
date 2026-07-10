-- Operating Spine — Phase 1: canonical entity registry (specs: BloomOS V3 #1).
--
-- One global table that names every linkable entity type as data: its key,
-- default label, owning module, route pattern, and icon. resolveEntity() in
-- lib/admin/entities.ts reads this (overlaying org_terminology for per-tenant
-- labels) so pages stop hardcoding their own (type, id) → link logic.
--
-- GLOBAL, NOT ORG-SCOPED (spec open decision A, confirmed in Phase 0 recon):
-- the structural facts (route pattern, module) are identical for every tenant,
-- exactly like role_permissions. Per-tenant naming is org_terminology's job.
--
-- DESCRIPTIVE, NOT EXECUTABLE: route_pattern is plain text with a literal
-- '{id}' placeholder, interpolated app-side. No SQL or code lives in rows.
--
-- WRITE GATE (Phase 0 recon of the role_permissions precedent): global config
-- tables carry a read-only policy for authenticated and NO write policy —
-- writes happen only via service role / migrations. private.has_permission
-- needs an org_id, which a global table doesn't have, so it can't gate this.
--
-- `module` matches the permission-module prefix used by every RLS policy
-- (`<module>.read`), so the action queue can permission-filter registry-linked
-- rows with the same vocabulary the database already enforces:
--   fundraising · ops · compliance · finance · board · program · messages

create table if not exists public.entity_types (
  entity_type   text primary key,          -- 'grant', 'constituent', 'partner', ...
  display_name  text not null,             -- default label; org_terminology overlays at read time
  module        text not null,             -- permission-module prefix, e.g. 'fundraising' → fundraising.read
  route_pattern text not null,             -- '/admin/fundraising/grants/{id}'; no '{id}' = list page
  icon          text,                      -- lucide icon name, resolved app-side
  created_at    timestamptz not null default now()
);

alter table public.entity_types enable row level security;

-- Read: any authenticated user (same as role_permissions — the registry holds
-- no tenant data). Deliberately no insert/update/delete policy: RLS default-
-- denies writes for authenticated; only service role / migrations write here.
drop policy if exists "read entity_types" on public.entity_types;
create policy "read entity_types" on public.entity_types
  for select to authenticated
  using (true);

-- Seed: every value observed in the four linking columns during Phase 0 recon
-- (ops_tasks.linked_entity_type: constituent, partner — CHECK also allows
-- opportunity/volunteer/milestone; notifications.linked_entity_type:
-- constituent, fr_prospects, message_thread; acknowledgments.subject_type
-- vocabulary from ack_v2) plus the near-term types the action queue links to.
-- Routes verified against real app/admin pages; patterns without '{id}' are
-- list pages (no per-record route exists yet).
insert into public.entity_types (entity_type, display_name, module, route_pattern, icon) values
  ('constituent',     'Donor',           'fundraising', '/admin/fundraising/donors/{id}',    'user'),
  ('partner',         'Partner',         'program',     '/admin/partners/{id}',              'handshake'),
  ('grant',           'Grant',           'fundraising', '/admin/fundraising/grants/{id}',    'file-text'),
  ('gift',            'Gift',            'fundraising', '/admin/fundraising/acknowledgments','gift'),
  ('pledge',          'Pledge',          'fundraising', '/admin/fundraising/pledges/{id}',   'calendar'),
  ('campaign',        'Campaign',        'fundraising', '/admin/fundraising/campaigns',      'megaphone'),
  ('opportunity',     'Opportunity',     'fundraising', '/admin/fundraising',                'target'),
  ('fr_prospects',    'Prospect',        'fundraising', '/admin/fundraising/prospects/{id}', 'binoculars'),
  ('volunteer',       'Volunteer',       'fundraising', '/admin/fundraising/donors/{id}',    'heart-handshake'),
  ('milestone',       'Milestone',       'fundraising', '/admin/fundraising',                'flag'),
  ('ops_task',        'Task',            'ops',         '/admin/ops',                        'check-square'),
  ('ops_project',     'Project',         'ops',         '/admin/ops/projects/{id}',          'folder'),
  ('compliance_item', 'Compliance item', 'compliance',  '/admin/compliance',                 'shield'),
  ('board_meeting',   'Board meeting',   'board',       '/admin/board',                      'users'),
  ('message_thread',  'Message thread',  'messages',    '/admin/messages',                   'message-circle')
on conflict (entity_type) do nothing;
