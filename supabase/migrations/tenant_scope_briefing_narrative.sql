-- Tenant-scope the Executive Briefing narrative cache.
--
-- bloomos_briefing_narrative was created out-of-band (live DB only — spec
-- bloomos-agenda §12) keyed by brief_date alone. That single-tenant key is a
-- cross-tenant leak: tenant B's first page-load of the day reads tenant A's
-- cached narrative, and tenant B's generation overwrites tenant A's row
-- (upsert onConflict brief_date). Create the table here so every environment
-- has it, add org_id, and rekey to (org_id, brief_date); the app now reads
-- and writes with an explicit org fence (lib/admin/briefing/narrate.ts).
--
-- Idempotent: safe to re-run, and safe on a fresh database.

create table if not exists public.bloomos_briefing_narrative (
  brief_date   date not null,
  headline     text not null,
  narrative    text not null,
  focus        text,
  input_hash   text,
  model        text,
  generated_at timestamptz not null default now()
);

alter table public.bloomos_briefing_narrative
  add column if not exists org_id uuid references public.orgs(id);

-- Backfill existing rows to the resident org — the only org that has used the
-- briefing to date (same convention as add_org_id_to_bloomos_briefing_state).
update public.bloomos_briefing_narrative
  set org_id = (select id from public.orgs where slug = 'ambition-angels')
  where org_id is null;

alter table public.bloomos_briefing_narrative
  alter column org_id set not null;

-- Drop any single-column key on brief_date (constraint name unknown — the
-- table was created out-of-band, so discover it from the catalog).
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.bloomos_briefing_narrative'::regclass
      and con.contype in ('p', 'u')
      and (
        select array_agg(a.attname::text order by a.attname)
        from pg_attribute a
        where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      ) = array['brief_date']
  loop
    execute format('alter table public.bloomos_briefing_narrative drop constraint %I', c.conname);
  end loop;
end $$;

-- The upsert target: one narrative per org per day.
create unique index if not exists bloomos_briefing_narrative_org_date_key
  on public.bloomos_briefing_narrative (org_id, brief_date);

-- Internal cache — service-role only, like bloomos_briefing_state. Enable RLS
-- with no policies so the anon/auth keys can't read or write it.
alter table public.bloomos_briefing_narrative enable row level security;
