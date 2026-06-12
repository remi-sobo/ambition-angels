-- BloomOS Ring 3: the student spine (modules/02-program.md "Students").
-- One roster + the journey pipeline from the product mockup:
-- discover → learn → practice → connect → launch (+ alumni / withdrawn).
-- Existing student-shaped data folds in idempotently: YGB campers (with
-- guardians) enter at 'learn'; career-quiz teens enter at 'discover'.
-- Demo Day signups are adults (companies/mentors) and stay out.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  constituent_id uuid references constituents(id) on delete set null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  dob date,
  grade text,
  school text,
  partner_id uuid references partners(id) on delete set null,
  location text,
  stage text not null default 'discover' check (stage in
    ('discover','learn','practice','connect','launch','alumni','withdrawn')),
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  notes text,
  last_activity_at date,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_org_idx on students (org_id);
create index if not exists students_stage_idx on students (stage);
create index if not exists students_partner_idx on students (partner_id);
create unique index if not exists students_external_idx
  on students (external_source, external_id)
  where external_id is not null;

do $$
declare
  aa uuid;
  t text := 'students';
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

-- ── Import YGB campers (engaged: stage 'learn') ──────────────────────────

insert into students (
  first_name, last_name, dob, grade, stage,
  guardian_name, guardian_email, guardian_phone,
  external_source, external_id, last_activity_at
)
select
  r.camper_first_name,
  r.camper_last_name,
  r.camper_dob,
  r.camper_grade,
  'learn',
  trim(coalesce(r.parent_first_name,'') || ' ' || coalesce(r.parent_last_name,'')),
  lower(r.parent_email),
  r.parent_phone,
  'ygb', r.id::text,
  (r.created_at at time zone 'utc')::date
from ygb_registrations r
on conflict (external_source, external_id) where external_id is not null
do nothing;

-- ── Import career-quiz teens (top of funnel: stage 'discover') ───────────
-- audience 'adult' means a parent filled it out for the teen, so the email
-- belongs in the guardian slot; teen-submitted emails are the student's.

insert into students (
  first_name, last_name, email, guardian_email, location, stage,
  external_source, external_id, last_activity_at
)
select
  nullif(split_part(trim(q.teen_name), ' ', 1), ''),
  nullif(substr(trim(q.teen_name), length(split_part(trim(q.teen_name), ' ', 1)) + 2), ''),
  case when q.audience = 'adult' then null else lower(q.email) end,
  case when q.audience = 'adult' then lower(q.email) else null end,
  q.location,
  'discover',
  'career_quiz', q.id::text,
  (q.created_at at time zone 'utc')::date
from quiz_submissions q
where coalesce(trim(q.teen_name), '') <> ''
  -- Skip quiz teens already on the roster (e.g. a YGB camper's family
  -- took the quiz with the same email).
  and not exists (
    select 1 from students s
    where coalesce(q.email,'') <> ''
      and (lower(q.email) = lower(coalesce(s.email,''))
        or lower(q.email) = lower(coalesce(s.guardian_email,'')))
  )
on conflict (external_source, external_id) where external_id is not null
do nothing;
