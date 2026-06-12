-- BloomOS Ring 3: cohorts + sessions + attendance
-- (modules/02-program.md "Attendance & dosage" + "Cohorts").
-- A cohort is a program × term × site grouping with capacity; sessions are
-- its scheduled service days; attendance is one row per student per session
-- (present/late/excused/absent) feeding dosage rollups. YGB Creators Camp
-- folds in as the first cohort, with its 8 campers enrolled and the five
-- camp days (Aug 3–7, 2026) pre-scheduled.

create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  program text,           -- offering label, e.g. 'YGB Creators Camp'
  term text,              -- cycle label, e.g. 'Summer 2026'
  location text,
  partner_id uuid references partners(id) on delete set null,
  capacity int check (capacity > 0),
  start_date date,
  end_date date,
  status text not null default 'planning' check (status in
    ('planning','active','completed','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cohorts_org_idx on cohorts (org_id);
create index if not exists cohorts_status_idx on cohorts (status);

create table if not exists cohort_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null default 'enrolled' check (status in
    ('enrolled','completed','dropped')),
  joined_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (cohort_id, student_id)
);
create index if not exists cohort_members_org_idx on cohort_members (org_id);
create index if not exists cohort_members_student_idx on cohort_members (student_id);

-- Named cohort_sessions (not the data model's `sessions`) to leave room for
-- an eventual auth-sessions table (TODO.md).
create table if not exists cohort_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  cohort_id uuid not null references cohorts(id) on delete cascade,
  session_date date not null,
  title text,
  starts_at time,
  ends_at time,
  location text,
  status text not null default 'scheduled' check (status in
    ('scheduled','held','canceled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cohort_sessions_org_idx on cohort_sessions (org_id);
create index if not exists cohort_sessions_cohort_idx
  on cohort_sessions (cohort_id, session_date);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  session_id uuid not null references cohort_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status text not null check (status in ('present','late','excused','absent')),
  method text not null default 'roster' check (method in
    ('roster','qr','kiosk','admin')),
  recorded_by text,
  recorded_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists attendance_org_idx on attendance (org_id);
create index if not exists attendance_student_idx on attendance (student_id);

do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;
  foreach t in array array['cohorts','cohort_members','cohort_sessions','attendance'] loop
    if t in ('cohorts','cohort_sessions') then
      execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
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

-- ── Fold YGB Creators Camp in as the first cohort ─────────────────────────
-- Dates/capacity/location from the public YGB page (app/ygb/YGBPage.jsx).

do $$
declare
  c uuid;
begin
  select id into c from cohorts where name = 'YGB Creators Camp 2026';
  if c is null then
    insert into cohorts
      (name, program, term, location, capacity, start_date, end_date, status)
    values
      ('YGB Creators Camp 2026', 'YGB Creators Camp', 'Summer 2026',
       '1265 Beach Street, East Palo Alto, CA', 20,
       '2026-08-03', '2026-08-07', 'active')
    returning id into c;
  end if;

  insert into cohort_members (cohort_id, student_id)
  select c, s.id from students s where s.external_source = 'ygb'
  on conflict (cohort_id, student_id) do nothing;

  insert into cohort_sessions (cohort_id, session_date, title, starts_at, ends_at)
  select
    c, d::date,
    case when d::date = date '2026-08-07'
      then 'Showcase Day'
      else 'Camp Day ' || (d::date - date '2026-08-03' + 1) end,
    time '09:30', time '15:00'
  from generate_series(date '2026-08-03', date '2026-08-07', interval '1 day') d
  where not exists (
    select 1 from cohort_sessions cs
    where cs.cohort_id = c and cs.session_date = d::date
  );
end $$;
