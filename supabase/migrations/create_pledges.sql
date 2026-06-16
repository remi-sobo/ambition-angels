-- BloomOS Fundraising Phase 2 / Epic F: pledges + installment schedules.
--
-- A pledge is a commitment to give a total over scheduled installments. Each
-- installment is a pledge_payment; when fulfilled it links to a real gift on
-- the spine (pledge_payments.gift_id), so revenue is never double-counted —
-- the gift is the money, the payment is the expectation.

create table if not exists pledges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  constituent_id uuid references constituents(id) on delete set null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  installment_count int not null check (installment_count >= 1),
  frequency text not null default 'monthly'
    check (frequency in ('weekly','monthly','quarterly','annually')),
  start_date date not null,
  campaign_id uuid references campaigns(id) on delete set null,
  fund_id uuid references funds(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pledges_org_id_idx on pledges (org_id);
create index if not exists pledges_constituent_idx on pledges (constituent_id);

create table if not exists pledge_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  pledge_id uuid not null references pledges(id) on delete cascade,
  due_date date not null,
  expected_amount numeric(12,2) not null check (expected_amount >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled','paid','skipped')),
  gift_id uuid references gifts(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pledge_payments_pledge_idx on pledge_payments (pledge_id);
create index if not exists pledge_payments_due_idx on pledge_payments (due_date)
  where status = 'scheduled';

-- updated_at trigger (pledges only), resident org default, fundraising-domain
-- RLS — same patterns as create_fundraising_core.sql / create_grants.sql.
do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute 'drop trigger if exists pledges_set_updated_at on pledges';
  execute 'create trigger pledges_set_updated_at before update on pledges for each row execute function set_updated_at()';

  foreach t in array array['pledges','pledge_payments'] loop
    execute format('alter table %I alter column org_id set default %L', t, aa);

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
