-- Tenant-scope the Executive Briefing decision state.
--
-- bloomos_briefing_state was created single-tenant (item_id text PRIMARY KEY).
-- Item ids are content-derived (e.g. a compliance/task signature), so two orgs
-- can produce the SAME item_id — without org_id the state would collide across
-- tenants (one org's "dismiss" hiding another org's live item, or an `undo`
-- deleting a foreign row). This adds org_id and makes the key composite so the
-- decision route (which already writes org_id) can fence reads/writes by org.
--
-- Idempotent: safe to re-run. RLS is unchanged — the table stays service-role
-- only (no policies), and the app now filters by org_id on the service client.

alter table public.bloomos_briefing_state
  add column if not exists org_id uuid references public.orgs(id);

-- Backfill existing rows to Ambition Angels — the only org that has used the
-- briefing to date (verified: all pre-migration rows are AA's).
update public.bloomos_briefing_state
  set org_id = (select id from public.orgs where slug = 'ambition-angels')
  where org_id is null;

alter table public.bloomos_briefing_state
  alter column org_id set not null;

-- Rebuild the primary key as (org_id, item_id) if org_id isn't part of it yet.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.bloomos_briefing_state'::regclass
      and c.contype = 'p'
      and a.attname = 'org_id'
  ) then
    alter table public.bloomos_briefing_state
      drop constraint if exists bloomos_briefing_state_pkey;
    alter table public.bloomos_briefing_state
      add primary key (org_id, item_id);
  end if;
end $$;

create index if not exists bloomos_briefing_state_org_idx
  on public.bloomos_briefing_state (org_id);
