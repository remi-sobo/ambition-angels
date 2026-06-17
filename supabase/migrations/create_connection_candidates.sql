-- Meetings tab — Shannon's connection backlog, Phase 1 (data only).
--
-- Remi's connection asks happen over email: he intros two people and puts
-- Shannon on the thread to "find us time." Today that ask lives only in the
-- thread. This adds the thin disposition layer that lets BloomOS surface those
-- intros as CANDIDATES (suggest), which Shannon then adds into a backlog item or
-- dismisses (confirm). Nothing auto-creates a task.
--
-- Locked decisions reflected here:
--   * The backlog itself is ops_tasks — NOT a new table. A connection is an
--     ops_task with assigned_to='shannon' and the label 'scheduling' (the
--     scheduling facet; ops_tasks groups/filters by category, so 'scheduling'
--     rides on labels rather than polluting the fixed category taxonomy).
--   * A connection ties to its person through the EXISTING ops_tasks entity
--     link (linked_entity_type='constituent' + linked_entity_id + linked_label)
--     — so no new ops_tasks.constituent_id column is added.
--   * connection_candidates is only a disposition layer over the existing Gmail
--     sync / interactions spine — it is not a second mailbox scanner and not a
--     second task store. It mirrors fr_prospect_disqualified (reversible
--     suppression keyed so dismissed items don't resurface) and the
--     fr_nba_suggestions lifecycle (pending → added/dismissed, with who/when).
--
-- A candidate is keyed by Gmail thread_id (unique) so re-syncs upsert rather
-- than duplicate, and a dismissed thread stays dismissed instead of reappearing.

create table if not exists connection_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Gmail thread the intro lives on. Unique so each sync upserts one candidate
  -- per thread; dismissed/added rows therefore suppress re-surfacing.
  thread_id text not null unique,
  -- The interaction row this candidate was detected from (the outbound,
  -- Shannon-present, reconciled email). Nullable + ON DELETE SET NULL: losing
  -- the source interaction must not drop Shannon's disposition.
  interaction_id uuid references interactions(id) on delete set null,
  -- The person the meeting is with (the reconciled constituent on the thread).
  constituent_id uuid not null references constituents(id) on delete cascade,
  subject text,
  status text not null default 'pending'
    check (status in ('pending', 'added', 'dismissed')),
  -- Set when Shannon adds the candidate to the backlog: the ops_task created
  -- from it. Nullable; ON DELETE SET NULL so deleting the task doesn't delete
  -- the (now orphaned) candidate record.
  ops_task_id uuid references ops_tasks(id) on delete set null,
  disposed_by text,
  disposed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The candidates queue reads pending rows; the constituent index backs the
-- per-person lookups (and the wrong-person-reconcile correction path).
create index if not exists connection_candidates_status_idx
  on connection_candidates (status, created_at desc);
create index if not exists connection_candidates_constituent_idx
  on connection_candidates (constituent_id);

-- ── updated_at trigger, org_id default, RLS ──────────────────────────────────
-- Same shape as the rest of the fundraising spine (create_fundraising_core.sql):
-- resident-tenant org_id default, member RLS gated on fundraising.read/.write.
-- set_updated_at() is defined by create_fundraising_core.sql.
do $$
declare
  aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute format(
    'alter table connection_candidates alter column org_id set default %L', aa);

  drop trigger if exists connection_candidates_set_updated_at on connection_candidates;
  create trigger connection_candidates_set_updated_at
    before update on connection_candidates
    for each row execute function set_updated_at();

  alter table public.connection_candidates enable row level security;

  drop policy if exists "members read connection_candidates" on public.connection_candidates;
  create policy "members read connection_candidates" on public.connection_candidates
    for select to authenticated
    using ( (select private.has_permission(org_id, 'fundraising.read')) );

  drop policy if exists "members write connection_candidates" on public.connection_candidates;
  create policy "members write connection_candidates" on public.connection_candidates
    for all to authenticated
    using ( (select private.has_permission(org_id, 'fundraising.write')) )
    with check ( (select private.has_permission(org_id, 'fundraising.write')) );
end $$;
