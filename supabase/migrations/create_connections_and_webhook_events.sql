-- BloomOS Ring 1: integration plumbing — connections (OAuth/API-key store)
-- and webhook_events (uniform ingestion log). Schemas per
-- docs/bloomos/03-architecture.md §5.
--
-- Both tables are SERVICE-PATH ONLY: RLS is enabled with no policies, so
-- authenticated and anon sessions are denied everything (tokens and raw
-- webhook payloads must never be readable from the browser, regardless of
-- role). Only the service-role client — webhook routes, Inngest jobs,
-- connection management endpoints — touches them.

-- ── connections ──────────────────────────────────────────────────────────

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  provider text not null,    -- 'quickbooks' | 'givebutter' | 'google' | 'gusto' | 'hubspot'
  external_id text,          -- e.g. QBO realmId
  access_token_enc bytea,    -- AES-256-GCM, app-layer; key lives in env/KMS
  refresh_token_enc bytea,
  expires_at timestamptz,
  status text not null default 'active',  -- active | expired | revoked | error
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, external_id)
);
create index if not exists connections_org_id_idx on connections (org_id);

-- Default org_id to the resident tenant, matching every other tenant table
-- (see add_org_id_to_tenant_tables.sql) so single-tenant service paths can
-- omit it.
do $$
declare aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;
  execute format('alter table connections alter column org_id set default %L', aa);
end $$;

alter table connections enable row level security;
-- No policies on purpose: deny-all for authenticated/anon.

-- ── webhook_events ───────────────────────────────────────────────────────
-- Global (no org_id): events arrive before the org is resolved; the
-- processor attributes them. The unique constraint is the dedupe — inserts
-- use ON CONFLICT DO NOTHING and return 2xx fast.

create table if not exists webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  external_event_id text not null,
  topic text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending',  -- pending | processed | failed | dead
  processed_at timestamptz,
  unique (provider, external_event_id)
);

-- Processor work-queue scan: unprocessed events, oldest first.
create index if not exists webhook_events_pending_idx
  on webhook_events (received_at)
  where status in ('pending','failed');

alter table webhook_events enable row level security;
-- No policies on purpose: deny-all for authenticated/anon.
