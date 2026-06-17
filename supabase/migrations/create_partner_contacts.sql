-- BloomOS Ring 3: Schools & Partners CRM, chunk 2 (modules/02-program.md
-- "Schools"). Builds the partner pipeline out from a single-champion stub
-- into a real CRM, mirroring the donor model:
--   • partners gains geography (city/region), a website domain, and a
--     priority score + rubric (the Emerging-Partners scoring dimensions).
--   • partner_contacts — many people per org, each a tagged contact with a
--     full profile (the spreadsheet has up to 9 contacts per org).
--   • partner_interactions — calls / emails / meetings / notes, the
--     activity timeline that powers touch cadence (same shape as the
--     fundraising `interactions` table).
-- Re-runnable: additive columns are guarded, tables use if-not-exists.

-- set_updated_at() already exists (create_partners.sql). Re-assert harmlessly.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Geography + scoring on the org ──────────────────────────────────────
alter table partners add column if not exists city text;
alter table partners add column if not exists region text;       -- state / metro
alter table partners add column if not exists domain text;        -- website
alter table partners add column if not exists priority_score int; -- 0–100 fit
-- Rubric breakdown (Emerging-Partners dimensions): geography, student
-- volume, execution readiness, funding connectivity, collab fundraising,
-- relational fit, population priority. Free-form jsonb so the rubric can
-- evolve without a migration.
alter table partners add column if not exists score_factors jsonb;

create index if not exists partners_region_idx on partners (region);
create index if not exists partners_kind_idx on partners (kind);

-- ── Contacts (many per partner) ─────────────────────────────────────────
create table if not exists partner_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  partner_id uuid not null references partners(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  title text,                         -- role at the org
  tags text[] not null default '{}',  -- 'champion','decision-maker',…
  notes text,
  is_primary boolean not null default false,
  last_touch_at date,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_contacts_partner_idx
  on partner_contacts (partner_id);
create unique index if not exists partner_contacts_external_idx
  on partner_contacts (external_source, external_id)
  where external_id is not null;

-- ── Interactions (the activity timeline) ────────────────────────────────
create table if not exists partner_interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  partner_id uuid not null references partners(id) on delete cascade,
  -- Optional: which person the touch was with (set null if they leave).
  contact_id uuid references partner_contacts(id) on delete set null,
  kind text not null default 'note'
    check (kind in ('call','email','meeting','event','note')),
  occurred_at timestamptz not null default now(),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists partner_interactions_partner_idx
  on partner_interactions (partner_id, occurred_at desc);

-- ── Org default + RLS + triggers (mirror partners: program.read/write) ──
do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array array['partner_contacts','partner_interactions'] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    -- Only partner_contacts has updated_at; guard the trigger to that table.
    if t = 'partner_contacts' then
      execute format(
        'create trigger %I before update on %I for each row execute function set_updated_at()',
        t || '_set_updated_at', t);
    end if;
    execute format('alter table %I alter column org_id set default %L', t, aa);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'program.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'program.write')) )
        with check ( (select private.has_permission(org_id, 'program.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;
