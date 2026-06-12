-- BloomOS Ring 3: intake (modules/02-program.md "Intake").
-- Public application form → applications; eligibility screening with
-- priority tiers; waitlist; offers; accept converts the applicant into a
-- student (+ cohort enrollment). Cohorts opt in to receiving applications
-- via accepting_applications.

alter table cohorts
  add column if not exists accepting_applications boolean not null default false;

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  cohort_id uuid references cohorts(id) on delete set null,
  student_id uuid references students(id) on delete set null, -- linked on accept
  first_name text not null,
  last_name text,
  email text,
  phone text,
  dob date,
  grade text,
  school text,
  location text,
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  motivation text,
  referral text,
  status text not null default 'new' check (status in
    ('new','eligible','ineligible','waitlisted','offered','accepted','declined','expired')),
  priority int not null default 2 check (priority between 1 and 3), -- 1 = high
  screening_notes text,
  offered_at timestamptz,
  decided_at timestamptz,
  external_source text not null default 'apply_form',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_org_idx on applications (org_id);
create index if not exists applications_status_idx on applications (status);
create index if not exists applications_cohort_idx on applications (cohort_id);

do $$
declare
  aa uuid;
  t text := 'applications';
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
      using ( (select private.has_permission(org_id, 'program.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'program.write')) )
      with check ( (select private.has_permission(org_id, 'program.write')) )
    $p$, 'members write ' || t, t);
end $$;
