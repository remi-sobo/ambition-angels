-- BloomOS V2 / Spec A, stage A1 — additive schema for contracts 2, 3, 7.
-- (specs/bloomos-v2-spec-a-platform-contracts.md · docs/v2-recon.md · docs/v2-preservation-ledger.md)
--
-- Strictly additive: no renames, no drops of tables or columns, no type
-- changes. Every new column is nullable with no default. Applied by hand in
-- the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).
--
-- ── Pre-apply data check (A1 kickoff, run 2026-09-03) ───────────────────────
--
-- 1. metric_definitions (org_id, metric_key): NO duplicates. The two
--    "monthly_donors" rows the recon flagged live in DIFFERENT orgs (YGB
--    manual/Development vs AA computed/fundraising), so the unique index below
--    creates cleanly. Nothing to pick.
--
-- 2. grant_requirements (org_id, grant_id, kind, due_date): ONE duplicate pair
--    (AA, grant 7052779b-5a83-496e-9c19-63d0805d99f7, kind 'application',
--    due 2026-07-31) — created 58 seconds apart on 2026-06-26, one unlabeled,
--    one "Application to Victoria". Reads as an accidental double-create.
--    THE INDEX BELOW WILL FAIL until one row is removed BY HAND (a data
--    decision, not this migration). Suggested, after eyeballing both:
--      -- delete from public.grant_requirements
--      --   where id = '934f5fd4-286b-47fc-bcea-0df6d80b6ca7';  -- the unlabeled one
--
-- 3. compliance_items (org_id, kind, jurisdiction, due_date): the only
--    colliding pair is kind='custom' — "RRF-1 CA DOJ" and "CA State Franchise
--    Tax Report", both CA / 2027-04-15 — which are GENUINELY DIFFERENT
--    obligations, not duplicates. So the compliance index is PARTIAL,
--    excluding kind='custom' (a deliberate deviation from the spec's draft
--    key, driven by this data): custom items are distinguished by title, and
--    upsert_obligation() (A3) must include title in the dedup key for them.
--
-- 4. role_permissions has no 'reports.approve' (only reports.read, 5 roles).
--    Seeded below per Spec A open decision 3, granted to owner + admin only.
--    Widening to finance is a one-line insert when Remi wants it.

-- ── Contract 2: metric_definitions gains the missing 4 of 10 fields ─────────
-- Nullable on purpose: the 72 existing rows stay unclassified rather than
-- being wrongly asserted as confirmed.

alter table public.metric_definitions
  add column if not exists numerator text,
  add column if not exists denominator text,
  add column if not exists population text,
  add column if not exists confirmed_state text;

comment on column public.metric_definitions.numerator is
  'Contract 2: what is being counted, in words (e.g. "second-track starts, FY26 cohort").';
comment on column public.metric_definitions.denominator is
  'Contract 2: the base population expression. NULL for plain counts.';
comment on column public.metric_definitions.population is
  'Contract 2: who the metric is about (e.g. "teens on a facilitated roster, current term").';
comment on column public.metric_definitions.confirmed_state is
  'Contract 2: confirmed | unconfirmed | conflict | stale. NULL = not yet classified. conflict/stale block export under Contract 7.';

-- Named check, drop-and-recreate for idempotency (house policy idiom).
alter table public.metric_definitions
  drop constraint if exists metric_definitions_confirmed_state_check;
alter table public.metric_definitions
  add constraint metric_definitions_confirmed_state_check
  check (confirmed_state is null
         or confirmed_state in ('confirmed','unconfirmed','conflict','stale'));

-- One definition per number, per org. Verified clean 2026-09-03 (see header).
create unique index if not exists metric_definitions_org_key_uidx
  on public.metric_definitions (org_id, metric_key);

-- ── Contract 3: additive columns on the three obligation tables ─────────────
-- why_it_matters is the sentence Today renders under the title (never a bare
-- number, never a bare checkbox). obligation_source distinguishes a
-- human-created task from an importer/automation/Reed row — what lets Today
-- explain why an item is there. snoozed_until is read by v_obligations (A2).
-- origin_path is the report-an-issue upgrade from the preservation gate: the
-- page the reporter was on, stored structured instead of buried in the
-- synthesized prompt text.

alter table public.ops_tasks
  add column if not exists why_it_matters text,
  add column if not exists obligation_source text,
  add column if not exists snoozed_until date,
  add column if not exists origin_path text;

comment on column public.ops_tasks.why_it_matters is
  'Contract 3: the one-sentence stake shown under the title on Today / Tasks.';
comment on column public.ops_tasks.obligation_source is
  'Contract 3: human | importer | automation | reed — who created the obligation. NULL = pre-contract row.';
comment on column public.ops_tasks.snoozed_until is
  'Contract 3: hidden from v_obligations until this date. Snooze, not resolution.';
comment on column public.ops_tasks.origin_path is
  'Report-an-issue: the /admin path the reporter was on (preservation gate, permitted change).';

alter table public.grant_requirements
  add column if not exists owner_id uuid,          -- auth.uid(); bare uuid per house convention
  add column if not exists snoozed_until date,
  add column if not exists why_it_matters text;

comment on column public.grant_requirements.owner_id is
  'Contract 3: the person who owes this requirement (auth.uid(), no FK per house convention). NULL = unassigned, surfaced as "no owner".';

alter table public.compliance_items
  add column if not exists snoozed_until date,
  add column if not exists why_it_matters text;

-- ── Contract 3: dedup indexes where the data allows a real constraint ───────
-- grant_requirements: full tuple, additive. WILL NOT CREATE until the one
-- existing duplicate pair (header, check 2) is resolved by hand.
create unique index if not exists grant_requirements_dedup_uidx
  on public.grant_requirements (org_id, grant_id, kind, due_date);

-- compliance_items: PARTIAL — kind='custom' excluded (header, check 3: two
-- genuinely different custom CA items share a due date today). Dedup for
-- custom items lives in upsert_obligation() (A3), which must include title.
create unique index if not exists compliance_items_dedup_uidx
  on public.compliance_items (org_id, kind, jurisdiction, due_date)
  where kind <> 'custom';

-- ops_tasks carries NO dedup index by design: 417 of 441 rows have NULL
-- linkage and plain personal tasks legitimately repeat. Its dedup is
-- upsert_obligation() only — enforced by review, not the database (Spec A
-- says so out loud rather than pretending otherwise).

-- ── Contract 7: export_waivers ──────────────────────────────────────────────
-- One row per waived block: who shipped what with which unresolved figure,
-- when, and why. Immutable by policy (insert + select only — an audit record
-- is never edited or deleted from the app). org_id NOT NULL, set from session
-- context, NO column default (the org_id-trap rule).

create table if not exists public.export_waivers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),  -- from session; NO default
  artifact_type text not null,        -- 'funder_report' | 'board_packet' | 'period_close' | 'send' | …
  artifact_id   text not null,        -- the artifact's id or period key (e.g. a report uuid, '2026-08')
  metric_key    text,                 -- the unresolved metric waived; NULL when the item is not a metric
  waived_by     uuid not null,        -- auth.uid() of the waiver; bare uuid per house convention
  waived_at     timestamptz not null default now(),
  reason        text,
  created_at    timestamptz not null default now()
);

comment on table public.export_waivers is
  'Contract 7: a permission-holder shipped an artifact past an unresolved item. The waiver names the item, the person, and the time, and travels with the artifact. Paired with an audit_log entry at write time.';

create index if not exists export_waivers_artifact_idx
  on public.export_waivers (org_id, artifact_type, artifact_id);

alter table public.export_waivers enable row level security;

drop policy if exists "report readers read export_waivers" on public.export_waivers;
create policy "report readers read export_waivers" on public.export_waivers
  for select to authenticated
  using ( (select private.has_permission(org_id, 'reports.read')) );

drop policy if exists "report approvers insert export_waivers" on public.export_waivers;
create policy "report approvers insert export_waivers" on public.export_waivers
  for insert to authenticated
  with check ( (select private.has_permission(org_id, 'reports.approve')) );

-- No update or delete policies: waivers are append-only from the app.

-- ── Contract 7: the reports.approve permission key ──────────────────────────
-- New key (Spec A open decision 3: its own key, not an overload of
-- org.manage). owner + admin only for now; granting finance is a one-line
-- insert when Remi rules on it.
insert into public.role_permissions (role, permission) values
  ('owner','reports.approve'),
  ('admin','reports.approve')
on conflict do nothing;

-- ── rollback (reference only; never applied automatically) ──────────────────
-- drop table if exists public.export_waivers;
-- drop index if exists metric_definitions_org_key_uidx;
-- drop index if exists grant_requirements_dedup_uidx;
-- drop index if exists compliance_items_dedup_uidx;
-- alter table public.metric_definitions drop constraint if exists metric_definitions_confirmed_state_check;
-- alter table public.metric_definitions drop column if exists numerator, drop column if exists denominator, drop column if exists population, drop column if exists confirmed_state;
-- alter table public.ops_tasks drop column if exists why_it_matters, drop column if exists obligation_source, drop column if exists snoozed_until, drop column if exists origin_path;
-- alter table public.grant_requirements drop column if exists owner_id, drop column if exists snoozed_until, drop column if exists why_it_matters;
-- alter table public.compliance_items drop column if exists snoozed_until, drop column if exists why_it_matters;
-- delete from public.role_permissions where permission = 'reports.approve';
