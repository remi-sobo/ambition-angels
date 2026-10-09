-- Capture, stage C1 (specs/bloomos-capture.md, Phase 0 rulings 4, 5, 11 and
-- docs/recon/capture-phase0.md). The ED taps Record, talks, and gets a stack
-- of proposed cards to confirm before anything writes to a real record. This
-- migration is the staging store and nothing else: no card is ever applied by
-- SQL here, and no route exists yet.
--
--   captures        one row per recording (transcript, status, provenance)
--   capture_cards   one row per proposed filing (dest, payload, match, status)
--
-- Both tables are org-scoped from session context with NO org_id default
-- (tenant-default ratchet) and are PERSONAL: every policy also requires
-- created_by = auth.uid(). An ED's raw voice notes about donors are not
-- readable by every ops user. RLS covers select, insert, update AND delete so
-- the whole feature stays on the user-session client; the meetings pipeline
-- went service-role because meeting_suggested_tasks shipped select-only, and
-- Capture does not copy that.
--
-- Also here, because they are schema the later stages depend on:
--   * partners_name_trgm            trigram index for the name matcher (C2)
--   * reed_drafts.kind += capture_message   the Message draft destination (C3)
--   * ai.capture entitlement        seeded on for AA and YGB (gate for C2)
--
-- Idempotent: create-if-not-exists, drop-and-recreate policies/triggers/
-- constraints, upsert seed. Apply via the Supabase dashboard, BEFORE the C2
-- route that gates on ai.capture deploys (seed before gate).
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── captures ────────────────────────────────────────────────────────────────

create table if not exists public.captures (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  source_surface   text not null
                   check (source_surface in ('mobile_plus', 'quick_add', 'entity_page', 'paste')),
  context_type     text
                   check (context_type is null or context_type in ('constituent', 'partner', 'opportunity')),
  context_id       uuid,
  transcript       text,
  duration_seconds integer,
  status           text not null default 'parsing'
                   check (status in ('parsing', 'ready', 'done', 'failed')),
  parse_error      text,
  model_used       text,
  -- ai_calls.id is a uuid primary key (create_ai_calls_ledger.sql), so a real
  -- FK is safe; the ledger row outlives nothing here, hence set null.
  ai_call_id       uuid references public.ai_calls(id) on delete set null
);

create index if not exists captures_org_owner_created_idx
  on public.captures (org_id, created_by, created_at desc);

-- Target for the composite FK below: a card's (capture_id, org_id) must match
-- its capture's (id, org_id), so a card can never point at another org's
-- capture. Declarative, no trigger, and it applies identically on the
-- scratch CI database and in production.
create unique index if not exists captures_id_org_idx
  on public.captures (id, org_id);

-- ── capture_cards ──────────────────────────────────────────────────────────

create table if not exists public.capture_cards (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  capture_id        uuid not null references public.captures(id) on delete cascade,
  created_by        uuid not null default auth.uid(),
  position          integer not null,
  dest              text not null
                    check (dest in ('interaction', 'task', 'thought', 'message_draft')),
  payload           jsonb not null default '{}'::jsonb,
  -- Never 'student': V1 stays out of youth data (spec Condition 2).
  entity_type       text
                    check (entity_type is null or entity_type in ('constituent', 'partner')),
  entity_id         uuid,
  heard_name        text,
  match_confidence  numeric,
  match_candidates  jsonb not null default '[]'::jsonb,
  status            text not null default 'proposed'
                    check (status in ('proposed', 'held', 'confirmed', 'discarded')),
  decided_by        uuid,
  decided_at        timestamptz,
  applied_table     text
                    check (applied_table is null or applied_table in
                      ('interactions', 'partner_interactions', 'ops_tasks', 'reed_drafts')),
  applied_id        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Same-org guarantee (see captures_id_org_idx above).
  foreign key (capture_id, org_id) references public.captures (id, org_id) on delete cascade
);

create index if not exists capture_cards_capture_position_idx
  on public.capture_cards (capture_id, position);

create index if not exists capture_cards_org_owner_status_idx
  on public.capture_cards (org_id, created_by, status);

-- ── updated_at ─────────────────────────────────────────────────────────────
-- public.set_updated_at() is the shared helper (create_asks_log.sql et al.).

drop trigger if exists captures_set_updated_at on public.captures;
create trigger captures_set_updated_at
  before update on public.captures
  for each row execute function public.set_updated_at();

drop trigger if exists capture_cards_set_updated_at on public.capture_cards;
create trigger capture_cards_set_updated_at
  before update on public.capture_cards
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
-- ops.read to select, ops.write to insert/update/delete, and in every case the
-- row must be the caller's own. The (select ...) wrapping matches the live
-- policies (initPlan once per statement instead of once per row).

alter table public.captures enable row level security;

drop policy if exists "owner reads captures" on public.captures;
create policy "owner reads captures" on public.captures
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner inserts captures" on public.captures;
create policy "owner inserts captures" on public.captures
  for insert to authenticated
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner updates captures" on public.captures;
create policy "owner updates captures" on public.captures
  for update to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  )
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner deletes captures" on public.captures;
create policy "owner deletes captures" on public.captures
  for delete to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

alter table public.capture_cards enable row level security;

drop policy if exists "owner reads capture_cards" on public.capture_cards;
create policy "owner reads capture_cards" on public.capture_cards
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'ops.read'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner inserts capture_cards" on public.capture_cards;
create policy "owner inserts capture_cards" on public.capture_cards
  for insert to authenticated
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner updates capture_cards" on public.capture_cards;
create policy "owner updates capture_cards" on public.capture_cards
  for update to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  )
  with check (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner deletes capture_cards" on public.capture_cards;
create policy "owner deletes capture_cards" on public.capture_cards
  for delete to authenticated
  using (
    (select private.has_permission(org_id, 'ops.write'))
    and created_by = (select auth.uid())
  );

-- ── partners.name trigram index (matcher, C2) ──────────────────────────────
-- constituents already carry first/last/org_name trigram indexes
-- (bloomos_global_search_phase3.sql); partners.name had none. Guarded on the
-- extension being present and resolved to whichever schema holds it, so this
-- file applies both in production (pg_trgm in `extensions`) and on the
-- scratch CI database (no pg_trgm, index skipped; RLS is what that run tests).

do $$
declare
  ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if ext_schema is not null then
    execute format(
      'create index if not exists partners_name_trgm on public.partners using gin (name %I.gin_trgm_ops)',
      ext_schema
    );
  end if;
end $$;

-- ── reed_drafts.kind += capture_message (Message draft destination, C3) ─────
-- Follows add_strategy_review_draft_kind.sql / spec_fin_report_artifacts.sql:
-- drop-and-recreate the kind check with the full list. Drafts stay drafts;
-- nothing in Capture sends.

alter table public.reed_drafts drop constraint if exists reed_drafts_kind_check;
alter table public.reed_drafts add constraint reed_drafts_kind_check
  check (kind in ('grant_narrative', 'board_update', 'acknowledgment', 'strategy_review',
                  'report_narrative', 'capture_message'));

-- ── ai.capture entitlement (seed before gate) ──────────────────────────────
-- Data, not code: orgs resolved by slug like seed_aa_ai_prospect_research.sql;
-- a no-op where the slugs are absent (the RLS scratch DB). Separate from
-- ai.reed on purpose: Capture needs its own explicit switch per tenant.

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'ai.capture', true, 'seed:capture'
from public.orgs o
where o.slug in ('ambition-angels', 'young-gifted-black')
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
