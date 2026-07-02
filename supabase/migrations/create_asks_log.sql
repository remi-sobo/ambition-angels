-- BloomOS Fundraising: the Ask Log.
--
-- Every solicitation we make — in any form (grant proposal, LOI, major-gift
-- ask, corporate/event sponsorship, in-kind, appeal, verbal, email, letter) —
-- is one `asks` row, always tied to a funder (a constituent). This is the
-- single place a fundraiser tracks what's been asked, of whom, for how much,
-- in what form, and how it landed. It complements the grants and opportunities
-- pipelines rather than replacing them: an ask optionally links to its grant or
-- major-gift opportunity so the record is shared, not duplicated.
--
-- `ask_documents` holds the files that back an ask — the proposal PDF, cover
-- letter, budget. The bytes live in the private `bloomos-asks` Storage bucket
-- (created out of band, like `bloomos-reports`); only the object path is kept
-- here.
--
-- Conventions match create_grants.sql / create_revenue_schedule.sql: a
-- set_updated_at trigger on the mutable table, per-domain fundraising RLS, and
-- — per the tenant-default ratchet — NO hardcoded org_id default; callers set
-- org_id explicitly from the parent row.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists asks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Every ask is tied to a funder. The funder is a constituent — usually an
  -- organization (foundation, company), but a person for a major-gift ask.
  funder_id uuid not null references constituents(id) on delete restrict,
  form text not null default 'grant_proposal' check (form in
    ('grant_proposal','loi','major_gift','corporate_sponsorship','event_sponsorship',
     'in_kind','appeal','verbal','email','letter','other')),
  title text,
  amount_requested numeric(12,2) check (amount_requested is null or amount_requested >= 0),
  ask_date date,
  status text not null default 'draft' check (status in
    ('draft','submitted','pending','awarded','partial','declined','withdrawn')),
  amount_committed numeric(12,2) check (amount_committed is null or amount_committed >= 0),
  decided_on date,
  owner text,
  -- Optional links back to the pipeline objects this ask corresponds to, so the
  -- ask log and the grant/major-gift record stay one shared thing.
  grant_id uuid references grants(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asks_org_idx on asks (org_id);
create index if not exists asks_funder_idx on asks (funder_id);
create index if not exists asks_status_idx on asks (status);
create index if not exists asks_ask_date_idx on asks (ask_date desc);
create index if not exists asks_grant_idx on asks (grant_id) where grant_id is not null;
create index if not exists asks_opportunity_idx on asks (opportunity_id) where opportunity_id is not null;

create table if not exists ask_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  ask_id uuid not null references asks(id) on delete cascade,
  -- Object path within the private `bloomos-asks` Storage bucket.
  storage_path text not null,
  filename text not null,
  mime text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  -- Free-form ("Proposal", "Budget", "Cover letter").
  label text,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists ask_documents_ask_idx on ask_documents (ask_id, created_at desc);
create unique index if not exists ask_documents_path_idx on ask_documents (storage_path);

-- set_updated_at trigger (asks only — ask_documents is append-only) and
-- per-domain fundraising RLS. Deliberately no org_id default (ratchet).
do $$
declare
  t text;
begin
  execute 'drop trigger if exists asks_set_updated_at on asks';
  execute 'create trigger asks_set_updated_at before update on asks for each row execute function set_updated_at()';

  foreach t in array array['asks','ask_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.read')) )
      $p$, 'members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format($p$
      create policy %I on public.%I
        for all to authenticated
        using ( (select private.has_permission(org_id, 'fundraising.write')) )
        with check ( (select private.has_permission(org_id, 'fundraising.write')) )
      $p$, 'members write ' || t, t);
  end loop;
end $$;
