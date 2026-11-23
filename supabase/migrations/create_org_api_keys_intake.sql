-- Website intake API v1 (specs/bloomos-repo-split.md §6a, phase 1a).
--
-- Two tables:
--
--   org_api_keys        One row per API key an org holds. The raw key is shown
--                       once at creation and never stored: only its sha256
--                       (key_hash) and an 8-char display prefix. The key
--                       resolves the org on every intake call, so a payload can
--                       never name its own org.
--
--   intake_submissions  The idempotency ledger. Every intake payload carries a
--                       submission_id (uuid made on the sending website). The
--                       first call claims (org_id, submission_id); a repeat
--                       (an outbox retry) gets the stored response back and
--                       inserts nothing.
--
-- Writes to both tables go through the service role only (the intake route
-- and the operator seed). Org owners and admins (org.manage) can read their
-- own org's rows, and can revoke a key by setting revoked_at. Nothing else.

create table if not exists public.org_api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,
  key_hash     text not null unique,
  scopes       text[] not null default '{}',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists org_api_keys_org_idx on public.org_api_keys (org_id);

alter table public.org_api_keys enable row level security;

drop policy if exists "managers read org_api_keys" on public.org_api_keys;
create policy "managers read org_api_keys" on public.org_api_keys
  for select to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) );

drop policy if exists "managers revoke org_api_keys" on public.org_api_keys;
create policy "managers revoke org_api_keys" on public.org_api_keys
  for update to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) )
  with check ( (select private.has_permission(org_id, 'org.manage')) );

-- Browser roles never create or delete keys, and the only column they may
-- change is revoked_at (no widening scopes, no moving a key between orgs).
revoke all on public.org_api_keys from anon;
revoke insert, update, delete on public.org_api_keys from authenticated;
grant select on public.org_api_keys to authenticated;
grant update (revoked_at) on public.org_api_keys to authenticated;

create table if not exists public.intake_submissions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  api_key_id    uuid references public.org_api_keys(id) on delete set null,
  kind          text not null,
  submission_id uuid not null,
  status        text not null default 'processing'
                check (status in ('processing', 'done')),
  response      jsonb,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (org_id, submission_id)
);

create index if not exists intake_submissions_org_created_idx
  on public.intake_submissions (org_id, created_at desc);

alter table public.intake_submissions enable row level security;

drop policy if exists "managers read intake_submissions" on public.intake_submissions;
create policy "managers read intake_submissions" on public.intake_submissions
  for select to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) );

revoke all on public.intake_submissions from anon;
revoke insert, update, delete on public.intake_submissions from authenticated;
grant select on public.intake_submissions to authenticated;
