-- BloomOS / Reed — Phase 2: the entitlement gate.
--
-- org_entitlements + private.has_entitlement: the smallest correct tier infra
-- Reed hangs off. No tier/billing infrastructure existed before this (orgs had
-- only id/name/slug/settings/timestamps), so this is the minimal thing that lets
-- a single key — 'ai.reed' — separate Bloom from Bloom Grow.
--
-- Billing is OUT of scope here (specs/bloomos-billing.md, not written). The
-- plan -> entitlement mapping (Bloom grants none, Bloom Grow grants ai.reed,
-- Bloom Flourish grants ai.reed + coaching) is billing's job later. For now
-- entitlements are set directly, and AA (tenant one) is seeded with the Bloom
-- Flourish bundle as DATA (Appendix B), so the coming repo extraction is a clean
-- lift with no AA special-casing in code.
--
-- Idempotent: create table/policies/function are if-not-exists / drop-recreate /
-- or-replace; the seed upserts.
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── Table ────────────────────────────────────────────────────────────────────
-- NO org_id default: org_id comes from the session on write, never a hardcoded
-- tenant (the trap Phase 1 just removed everywhere else).
create table if not exists public.org_entitlements (
  org_id     uuid        not null references public.orgs(id),
  feature_key text       not null,
  enabled    boolean     not null default false,
  source     text,
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key)
);

alter table public.org_entitlements enable row level security;

-- Reads: any member of the org may see their own org's entitlement rows (the app
-- reads this to decide whether to show Reed / allow /api/reed/*). Membership is
-- the right grain here — every role needs to know its own tier — so this checks
-- membership directly rather than a specific permission string.
drop policy if exists "members read org_entitlements" on public.org_entitlements;
create policy "members read org_entitlements" on public.org_entitlements
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.org_id = org_entitlements.org_id
    )
  );

-- Writes: only org managers (org.manage) may change entitlements. Same idiom as
-- the rest of the schema — (select private.has_permission(org_id, '...')).
drop policy if exists "managers write org_entitlements" on public.org_entitlements;
create policy "managers write org_entitlements" on public.org_entitlements
  for all to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) )
  with check ( (select private.has_permission(org_id, 'org.manage')) );

-- ── DB-side predicate ────────────────────────────────────────────────────────
-- Mirrors private.has_permission. The app checks entitlement by reading the
-- table through the session client (RLS-scoped); this SQL twin exists for
-- future RLS policies / SQL that need to gate on a tier inside the database.
create or replace function private.has_entitlement(p_org uuid, p_key text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_entitlements e
    where e.org_id = p_org and e.feature_key = p_key and e.enabled
  );
$$;

-- ── Seed: AA (tenant one) at Bloom Flourish — Appendix B ─────────────────────
-- Data, not code. ai.reed + coaching = the Bloom Flourish bundle. AA's uuid here
-- is a one-time tenant-one bootstrap (like the Phase 1 backfills), not a default.
-- AA resolved by slug (no hardcoded org uuid), mirroring the agenda-delegations
-- seed. In production 'ambition-angels' is org 17c75da8…; against a fresh DB
-- (or the RLS leak test) it resolves to whatever id that org carries, and is a
-- no-op if the org isn't present.
insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, v.feature_key, true, 'seed:bloom_flourish'
from public.orgs o
cross join (values ('ai.reed'), ('coaching')) v(feature_key)
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = excluded.enabled, source = excluded.source, updated_at = now();
