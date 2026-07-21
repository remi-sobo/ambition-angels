-- Governance profile views (Ring 4 follow-on): per-record pages for board
-- members and compliance items, with the standard record panels (tasks,
-- documents, comments, audit history) the fundraising/program profiles get.
--
-- Four pieces:
--   1. board_members grows the profile fields the roster row never surfaced
--      (phone / affiliation / bio) plus an onboarding checklist (same jsonb
--      [{id, text, done}] shape as compliance_items.checklist).
--   2. compliance_filings — permanent one-row-per-filing history. Before
--      this, "mark filed" rolled due_date forward and the past filing only
--      survived inside audit_log; now each filing is a queryable record that
--      can carry confirmation number, fee, and the receipt via documents.
--   3. ops_tasks link vocabulary widens to board_member / board_meeting /
--      compliance_item so EntityTasks can anchor prep work to them.
--   4. entity_types registry: board_member becomes a linkable type and the
--      board/compliance route patterns point at the new per-record pages.

-- ── 1. Board member profile fields ───────────────────────────────────────

alter table public.board_members
  add column if not exists phone text,
  add column if not exists affiliation text,   -- employer / org, for the roster + annual report
  add column if not exists bio text,
  add column if not exists checklist jsonb not null default '[]'::jsonb;

-- ── 2. Filing history ────────────────────────────────────────────────────

create table if not exists compliance_filings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  item_id uuid not null references compliance_items(id) on delete cascade,
  filed_date date not null,
  -- The due date this filing satisfied (null on backfilled rows where the
  -- rolling engine had already advanced due_date past it).
  period_due_date date,
  filed_by text,
  confirmation text,          -- confirmation / tracking number from the filer portal
  fee numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compliance_filings_org_idx on compliance_filings (org_id);
create index if not exists compliance_filings_item_idx on compliance_filings (item_id, filed_date desc);

-- No org_id default (the org_id-default trap is frozen — tenant-default
-- ratchet): every writer sets org_id explicitly from the session org.
do $$
declare
  t text := 'compliance_filings';
begin
  execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
  execute format(
    'create trigger %I before update on %I for each row execute function set_updated_at()',
    t || '_set_updated_at', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for select to authenticated
      using ( (select private.has_permission(org_id, 'compliance.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'compliance.write')) )
      with check ( (select private.has_permission(org_id, 'compliance.write')) )
    $p$, 'members write ' || t, t);
end $$;

-- Seed history from the one fact the old model kept: items already marked
-- filed at least once get their latest filing as a first history row.
insert into compliance_filings (org_id, item_id, filed_date)
select c.org_id, c.id, c.last_filed_at::date
from compliance_items c
where c.last_filed_at is not null
  and not exists (select 1 from compliance_filings f where f.item_id = c.id);

-- ── 3. Task links to governance records ──────────────────────────────────
-- Each widening drops and re-creates the CHECK with the full list (same
-- pattern as prospect_task_links.sql, which this supersedes). Mirror in
-- LINK_TYPES (app/api/admin/ops/tasks/route.ts).

alter table public.ops_tasks
  drop constraint if exists ops_tasks_linked_entity_type_check;
alter table public.ops_tasks
  add constraint ops_tasks_linked_entity_type_check
  check (
    linked_entity_type is null
    or linked_entity_type in (
      'partner', 'constituent', 'opportunity', 'volunteer', 'milestone',
      'student', 'cohort', 'application', 'program', 'grant', 'document', 'metric',
      'fr_prospects',
      'board_member', 'board_meeting', 'compliance_item'
    )
  );

-- ── 4. Entity registry ───────────────────────────────────────────────────

insert into public.entity_types (entity_type, display_name, module, route_pattern, icon) values
  ('board_member', 'Board member', 'board', '/admin/board/{id}', 'user-check')
on conflict (entity_type) do nothing;

-- Per-record pages now exist for compliance items; board meetings stay
-- managed on the hub page.
update public.entity_types
  set route_pattern = '/admin/compliance/{id}'
  where entity_type = 'compliance_item'
    and route_pattern = '/admin/compliance';

-- ── rollback ──────────────────────────────────────────────
-- alter table public.board_members drop column phone, drop column affiliation,
--   drop column bio, drop column checklist;
-- drop table public.compliance_filings cascade;
-- (re-add the previous ops_tasks CHECK from prospect_task_links.sql)
-- delete from public.entity_types where entity_type = 'board_member';
-- update public.entity_types set route_pattern = '/admin/compliance'
--   where entity_type = 'compliance_item';
