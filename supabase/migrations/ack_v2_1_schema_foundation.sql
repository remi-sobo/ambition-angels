-- Acknowledgments v2 (Stewardship) — Phase 1: schema foundation.
--
-- Three changes, one migration:
--   1. Make `acknowledgments` polymorphic so we can thank non-gift subjects
--      (a volunteer, a foundation/DAF grant opportunity, a milestone), not
--      only a recorded gift. gift_id becomes nullable; subject_* mirror the
--      ops_tasks linked-entity convention; ops_task_id back-links the task a
--      send fulfilled.
--   2. ack_templates — a named, channel-specific template library that will
--      replace the free-text `template` column, with one default per
--      (subject_type, channel).
--   3. stewardship_rules — the data-driven matrix that decides, per gift,
--      whether to auto-send a receipt, spawn a human task, both, or neither.
--
-- The two new tables are org-scoped with the same has_permission RLS as the
-- rest of fundraising. They deliberately carry NO org_id column default:
-- every insert (app + seed) sets org_id from the session, so a second tenant
-- can never inherit Ambition Angels' org by riding a default (the org_id-leak
-- trap). The legacy acknowledgments org_id default is left untouched here and
-- sequenced for its own drop once all write paths are converted.

-- ── 1. acknowledgments → polymorphic ────────────────────────────────────────

alter table public.acknowledgments
  alter column gift_id drop not null;

alter table public.acknowledgments
  add column if not exists subject_type  text,
  add column if not exists subject_id    uuid,
  add column if not exists subject_label text,
  add column if not exists ops_task_id   uuid references public.ops_tasks(id) on delete set null;

-- Subject vocabulary mirrors ops_tasks.linked_entity_type, extended in lockstep.
alter table public.acknowledgments
  drop constraint if exists acknowledgments_subject_type_check;
alter table public.acknowledgments
  add constraint acknowledgments_subject_type_check
  check (
    subject_type is null
    or subject_type in ('gift','constituent','opportunity','volunteer','milestone')
  );

-- A row must point at a gift, a subject, or both — never neither. The two
-- existing rows are gift-backed, so this is satisfied by current data.
alter table public.acknowledgments
  drop constraint if exists acknowledgments_has_subject_check;
alter table public.acknowledgments
  add constraint acknowledgments_has_subject_check
  check (gift_id is not null or subject_id is not null);

create index if not exists acknowledgments_subject_idx
  on public.acknowledgments (subject_type, subject_id);
create index if not exists acknowledgments_ops_task_idx
  on public.acknowledgments (ops_task_id);

-- ── 2. ack_templates — template library ─────────────────────────────────────

create table if not exists public.ack_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  name         text not null,
  subject_type text not null default 'gift'
    check (subject_type in ('gift','constituent','opportunity','volunteer','milestone')),
  channel      text not null default 'email'
    check (channel in ('email','letter','call','text','in_person')),
  subject      text,
  body         text not null default '',
  is_default   boolean not null default false,
  applies_when jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ack_templates_lookup_idx
  on public.ack_templates (org_id, subject_type, channel);
-- At most one default per (org, subject_type, channel).
create unique index if not exists ack_templates_one_default_idx
  on public.ack_templates (org_id, subject_type, channel)
  where is_default;

-- ── 3. stewardship_rules — the matrix ───────────────────────────────────────

create table if not exists public.stewardship_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id),
  name        text not null,
  rank        int not null default 100,     -- lower rank wins; first match decides
  conditions  jsonb not null default '{}'::jsonb,
  action      text not null default 'create_task'
    check (action in ('auto_email','create_task','create_task_and_draft','none')),
  channel     text not null default 'email'
    check (channel in ('email','letter','call','text','in_person')),
  template_id uuid references public.ack_templates(id) on delete set null,
  sla_hours   int not null default 48,
  -- Mirrors ops_tasks.assigned_to so a rule can route the spawned task.
  assignee    text check (assignee is null or assignee in ('remi','shannon')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists stewardship_rules_eval_idx
  on public.stewardship_rules (org_id, rank)
  where active;

-- ── RLS + updated_at, mirroring the fundraising convention ───────────────────
-- No `alter column org_id set default` here: org_id is always set from session.

do $$
declare t text;
begin
  foreach t in array array['ack_templates','stewardship_rules'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function set_updated_at()',
      t || '_set_updated_at', t
    );

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.read')) )
      $p$, 'members read ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.write')) )
        with check ( (select private.has_permission(org_id, 'fundraising.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;
