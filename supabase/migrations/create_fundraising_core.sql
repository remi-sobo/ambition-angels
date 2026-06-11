-- BloomOS Ring 2: fundraising core — the party table and the money spine.
-- Schema per docs/bloomos/05-data-model.md §2–3 (constituents, households,
-- relationships, interactions, funds/campaigns/appeals, gifts, soft credits,
-- recurring plans, acknowledgments). Pledges, tributes, opportunities,
-- grants, and segments land in the next Ring 2 chunks.
--
-- Also merges Stripe donations into the spine (roadmap: "Stripe donations
-- merged"): a trigger on the legacy `donations` table ingests every new row
-- into constituents + gifts, and the same function backfills history.
-- Idempotent end to end — safe to re-run; gifts dedupe on
-- (external_source, external_id).

-- Self-sufficient updated_at helper (same definition as earlier migrations).
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  salutation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists constituents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  type text not null default 'person' check (type in ('person','organization')),
  first_name text,
  last_name text,
  org_name text,
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  street text,
  city text,
  state text,
  postal_code text,
  tags text[] not null default '{}',
  do_not_contact boolean not null default false,
  household_id uuid references households(id) on delete set null,
  source text not null default 'manual',  -- 'manual'|'stripe'|'givebutter'|'hubspot_import'|...
  external_ids jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists constituents_org_id_idx on constituents (org_id);
create index if not exists constituents_emails_idx on constituents using gin (emails);
create index if not exists constituents_last_name_idx on constituents (last_name);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  a_id uuid not null references constituents(id) on delete cascade,
  b_id uuid not null references constituents(id) on delete cascade,
  kind text not null,  -- 'spouse'|'employer'|'board_contact'|'school_champion'|'knows'|...
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists relationships_a_idx on relationships (a_id);
create index if not exists relationships_b_idx on relationships (b_id);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  constituent_id uuid not null references constituents(id) on delete cascade,
  kind text not null check (kind in ('call','email','meeting','event','note')),
  occurred_at timestamptz not null default now(),
  notes text,
  logged_by text,
  created_at timestamptz not null default now()
);
create index if not exists interactions_constituent_idx on interactions (constituent_id, occurred_at desc);

-- Three-axis attribution: fund (what for; carries GL/restriction — never
-- hand-typed on gifts), campaign (umbrella), appeal (which solicitation).
create table if not exists funds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  restricted boolean not null default false,
  gl_code text,
  qbo_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  goal numeric(12,2),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appeals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  campaign_id uuid references campaigns(id) on delete set null,
  name text not null,
  source_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recurring_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  constituent_id uuid references constituents(id) on delete set null,
  amount numeric(12,2) not null,
  frequency text not null default 'monthly',
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists recurring_plans_external_idx
  on recurring_plans (external_source, external_id)
  where external_id is not null;

create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  -- Hard credit. Nullable: a gift with no usable identity (anonymous) still
  -- counts in revenue rollups.
  constituent_id uuid references constituents(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  gift_date date not null,
  method text not null default 'card'
    check (method in ('card','cash','check','ach','in_kind','stock','other')),
  -- IRS quid-pro-quo split (>$75 disclosure): deductible = amount - FMV.
  deductible_amount numeric(12,2),
  fair_market_value numeric(12,2),
  campaign_id uuid references campaigns(id) on delete set null,
  fund_id uuid references funds(id) on delete set null,
  appeal_id uuid references appeals(id) on delete set null,
  recurring_plan_id uuid references recurring_plans(id) on delete set null,
  external_source text,  -- 'stripe'|'givebutter'|...
  external_id text,
  acknowledgment_status text not null default 'pending'
    check (acknowledgment_status in ('pending','not_required','sent')),
  acknowledged_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gifts_org_id_idx on gifts (org_id);
create index if not exists gifts_constituent_idx on gifts (constituent_id, gift_date desc);
create index if not exists gifts_date_idx on gifts (gift_date desc);
create unique index if not exists gifts_external_idx
  on gifts (external_source, external_id)
  where external_id is not null;

-- Soft credits never count in revenue rollups, always in recognition
-- rollups (two aggregate paths — invariant from 05 §3).
create table if not exists soft_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  gift_id uuid not null references gifts(id) on delete cascade,
  constituent_id uuid not null references constituents(id) on delete cascade,
  type text not null check (type in ('household','daf_advisor','match_originator','solicitor')),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists soft_credits_gift_idx on soft_credits (gift_id);
create index if not exists soft_credits_constituent_idx on soft_credits (constituent_id);

create table if not exists acknowledgments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  gift_id uuid not null references gifts(id) on delete cascade,
  template text,
  channel text check (channel in ('email','letter')),
  sent_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now()
);
create index if not exists acknowledgments_gift_idx on acknowledgments (gift_id);

-- ── updated_at triggers, org_id defaults, RLS ───────────────────────────

do $$
declare
  aa uuid;
  t text;
  tables_with_updated_at text[] := array[
    'households','constituents','funds','campaigns','appeals',
    'recurring_plans','gifts'
  ];
  all_tables text[] := array[
    'households','constituents','relationships','interactions',
    'funds','campaigns','appeals','recurring_plans','gifts',
    'soft_credits','acknowledgments'
  ];
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  foreach t in array tables_with_updated_at loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_set_updated_at', t);
  end loop;

  foreach t in array all_tables loop
    -- Resident-tenant default, matching every other tenant table.
    execute format('alter table %I alter column org_id set default %L', t, aa);

    -- Per-domain RLS, same shape as enable_rls_per_domain.sql.
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

-- ── Stripe donation ingestion ────────────────────────────────────────────
-- One code path for live writes (trigger) and backfill: upsert a
-- constituent by email, then insert the gift keyed on the Stripe payment
-- id. Conflict-ignore makes the whole thing idempotent.

create or replace function fr_ingest_donation(d donations)
returns void
language plpgsql
as $$
declare
  cid uuid;
  plan uuid;
  fname text;
  lname text;
begin
  -- Only money that actually arrived becomes a gift.
  if d.status is not null and d.status <> 'succeeded' then
    return;
  end if;
  if d.stripe_payment_id is null or d.stripe_payment_id = '' then
    return;
  end if;

  if d.email is not null and d.email <> '' then
    select c.id into cid
    from constituents c
    where c.org_id = d.org_id
      and lower(d.email) = any (select lower(e) from unnest(c.emails) e)
    limit 1;

    if cid is null then
      -- Older rows carry a single `name`; newer ones first/last.
      fname := coalesce(d.first_name, nullif(split_part(coalesce(d.name, ''), ' ', 1), ''));
      lname := coalesce(d.last_name, nullif(substr(coalesce(d.name, ''), length(split_part(coalesce(d.name, ''), ' ', 1)) + 2), ''));
      insert into constituents (org_id, type, first_name, last_name, emails, source)
      values (d.org_id, 'person', fname, lname, array[lower(d.email)], 'stripe')
      returning id into cid;
    end if;
  end if;

  if d.recurring and d.subscription_id is not null and d.subscription_id <> '' then
    insert into recurring_plans (org_id, constituent_id, amount, frequency, external_source, external_id)
    values (d.org_id, cid, d.amount, 'monthly', 'stripe', d.subscription_id)
    on conflict (external_source, external_id) where external_id is not null
    do update set constituent_id = coalesce(recurring_plans.constituent_id, excluded.constituent_id)
    returning id into plan;
  end if;

  insert into gifts (
    org_id, constituent_id, amount, gift_date, method,
    recurring_plan_id, external_source, external_id, acknowledgment_status
  )
  values (
    d.org_id, cid, d.amount, (d.created_at at time zone 'utc')::date, 'card',
    plan, 'stripe', d.stripe_payment_id,
    -- IRS Pub 1771: contemporaneous written acknowledgment required >= $250.
    case when d.amount >= 250 then 'pending' else 'not_required' end
  )
  on conflict (external_source, external_id) where external_id is not null
  do nothing;
end;
$$;

create or replace function fr_ingest_donation_tg()
returns trigger
language plpgsql
as $$
begin
  perform fr_ingest_donation(new);
  return new;
end;
$$;

create or replace function fr_donations_after_update()
returns trigger
language plpgsql
as $$
begin
  if (new.status is null or new.status = 'succeeded') then
    perform fr_ingest_donation(new);
  else
    -- Payment failed / refunded / cancelled after the fact: the gift never
    -- happened. The dedupe key finds it.
    delete from gifts
    where external_source = 'stripe' and external_id = new.stripe_payment_id;
  end if;
  return new;
end;
$$;

drop trigger if exists donations_fr_ingest on donations;
create trigger donations_fr_ingest
  after insert on donations
  for each row execute function fr_ingest_donation_tg();

drop trigger if exists donations_fr_sync_status on donations;
create trigger donations_fr_sync_status
  after update of status on donations
  for each row execute function fr_donations_after_update();

-- ── Backfill existing Stripe history (idempotent) ────────────────────────

do $$
declare
  d donations%rowtype;
begin
  for d in select * from donations order by created_at loop
    perform fr_ingest_donation(d);
  end loop;
end $$;
