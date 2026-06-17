-- BloomOS Fundraising Phase 3 / Epic I: donor communications.
--
-- An email_campaign is a message sent to a saved segment; email_sends is the
-- per-recipient ledger (audit + dedupe). Fundraising-domain RLS, same pattern
-- as the rest of the module.

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  subject text not null,
  body text not null default '',
  segment_id uuid references segments(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sending','sent')),
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  sent_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_campaigns_org_idx on email_campaigns (org_id);

create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  constituent_id uuid references constituents(id) on delete set null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists email_sends_campaign_idx on email_sends (campaign_id);

do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute 'drop trigger if exists email_campaigns_set_updated_at on email_campaigns';
  execute 'create trigger email_campaigns_set_updated_at before update on email_campaigns for each row execute function set_updated_at()';

  foreach t in array array['email_campaigns','email_sends'] loop
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
