-- BloomOS Ring 4: compliance calendar (modules/07-governance.md).
-- v1 engine: each item carries its NEXT due date + a recurrence; marking an
-- item filed rolls the date forward and resets it (handled in the API).
-- Seeded with a US 501(c)(3) template calendar — dates are templates, the
-- notes say to verify against actual filings.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists compliance_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  kind text not null default 'custom' check (kind in
    ('form_990','state_charitable','corporate_report','employment_tax',
     'insurance','policy','public_disclosure','contract','custom')),
  title text not null,
  jurisdiction text,                 -- 'IRS' | 'CA' | 'Federal' | …
  due_date date not null,            -- next occurrence
  recur text not null default 'annual' check (recur in
    ('annual','quarterly','biennial','none')),
  status text not null default 'upcoming' check (status in
    ('upcoming','in_progress','filed','waived')),
  assigned_to text,
  notes text,
  last_filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compliance_items_org_idx on compliance_items (org_id);
create index if not exists compliance_items_due_idx on compliance_items (due_date)
  where status in ('upcoming','in_progress');

do $$
declare
  aa uuid;
  t text := 'compliance_items';
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
  execute format(
    'create trigger %I before update on %I for each row execute function set_updated_at()',
    t || '_set_updated_at', t);
  execute format('alter table %I alter column org_id set default %L', t, aa);
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for select to authenticated
      using ( (select private.has_permission(org_id, 'compliance.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'compliance.write')) )
      with check ( (select private.has_permission(org_id, 'compliance.write')) )
    $p$, 'members write ' || t, t);
end $$;

-- ── Seed template calendar (idempotent by title) ─────────────────────────

insert into compliance_items (kind, title, jurisdiction, due_date, recur, notes)
select v.kind, v.title, v.jurisdiction, v.due_date::date, v.recur, v.notes
from (values
  ('form_990','Form 990 (FY2025, extended deadline)','IRS','2026-11-15','annual',
   'Calendar-year filers: May 15, or Nov 15 with Form 8868 extension. 3 consecutive missed years = automatic revocation. Template date — verify.'),
  ('state_charitable','CA charitable registration renewal (RRF-1 + CT-TR-1/990)','CA','2026-11-15','annual',
   'Due 4 months 15 days after FYE; IRS extension honored. Template date — verify.'),
  ('corporate_report','CA Statement of Information (SI-100)','CA','2026-12-31','biennial',
   'Biennial for nonprofits, due in the registration anniversary month. Template date — verify your month.'),
  ('employment_tax','Form 941 — Q2 payroll taxes','IRS','2026-07-31','quarterly',
   'Quarterly: Apr 30 / Jul 31 / Oct 31 / Jan 31.'),
  ('employment_tax','W-2 + 1099-NEC filings (TY2026)','IRS','2027-01-31','annual',
   '1099-NEC threshold is $2,000 for payments made in 2026. Recipient + IRS/SSA copies due Jan 31.'),
  ('insurance','GL + D&O insurance renewal','—','2026-12-31','annual',
   'Template date — set to your actual policy renewal date; start the renewal application 30–60 days early.'),
  ('policy','Board conflict-of-interest annual disclosures','—','2026-12-31','annual',
   'Annual signed COI disclosure from every director — answers Form 990 Part VI Q12.'),
  ('public_disclosure','Public-disclosure check: 3 most recent 990s + 1023 available','IRS','2026-12-31','annual',
   'Posting on the website satisfies the copies obligation.')
) as v(kind, title, jurisdiction, due_date, recur, notes)
where not exists (
  select 1 from compliance_items c where c.title = v.title
);
