-- BloomOS Ring 1: append-only, partitioned audit log.
-- See docs/bloomos/04-security-compliance.md §2.
--
-- Application-level log (captures HTTP context and sensitive READS, which
-- DB triggers cannot see). Monthly range partitions; retention = drop
-- partition. Doubles as the FERPA §99.32 disclosure ledger.

create table if not exists audit_log (
  id bigint generated always as identity,
  ts timestamptz not null default now(),
  org_id uuid not null,
  actor_user_id uuid,
  action text not null,        -- 'create'|'update'|'delete'|'export'|'view_sensitive'|...
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  request_id text,
  primary key (id, ts)
) partition by range (ts);

create index if not exists audit_log_org_ts_idx on audit_log (org_id, ts desc);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id);

-- Append-only for app roles. (The postgres role can still alter — true
-- immutability comes from the nightly off-platform export.)
revoke update, delete, truncate on audit_log from authenticated, anon;

alter table audit_log enable row level security;

-- Org admins can read their own org's log; nobody inserts directly from the
-- client (writes happen in server code via service role or definer RPC).
drop policy if exists "org managers read audit log" on audit_log;
create policy "org managers read audit log" on audit_log
  for select to authenticated
  using ( (select private.has_permission(org_id, 'org.manage')) );

-- Create current + next month partitions now; a pg_cron job keeps rolling
-- partitions ahead and drops expired ones (12-month hot retention).
do $$
declare
  m date := date_trunc('month', now())::date;
  i int;
begin
  for i in 0..2 loop
    execute format(
      'create table if not exists audit_log_%s partition of audit_log
         for values from (%L) to (%L)',
      to_char(m + (i || ' months')::interval, 'YYYY_MM'),
      m + (i || ' months')::interval,
      m + ((i + 1) || ' months')::interval
    );
  end loop;
end $$;

-- Monthly partition maintenance via pg_cron (idempotent re-schedule).
create extension if not exists pg_cron;
select cron.unschedule('audit-log-partitions')
  where exists (select 1 from cron.job where jobname = 'audit-log-partitions');
select cron.schedule(
  'audit-log-partitions',
  '0 3 25 * *',   -- 25th of each month, 03:00 UTC
  $cron$
  do $$
  declare
    nxt date := date_trunc('month', now() + interval '1 month')::date;
    old date := date_trunc('month', now() - interval '12 months')::date;
  begin
    execute format(
      'create table if not exists audit_log_%s partition of audit_log
         for values from (%L) to (%L)',
      to_char(nxt, 'YYYY_MM'), nxt, nxt + interval '1 month');
    execute format('drop table if exists audit_log_%s',
      to_char(old, 'YYYY_MM'));
  end $$;
  $cron$
);
