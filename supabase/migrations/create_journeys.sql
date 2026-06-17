-- BloomOS Fundraising Phase 3 / Epic J: journey automation.
--
-- A journey is a triggered, multi-step email sequence. Enrollment happens on a
-- trigger (first gift, lapsed) or manually; the cron advances each enrollment
-- through its steps on a delay, sending via the comms email path. Acts on the
-- retention signals BloomOS already computes — re-engagement without manual work.

create table if not exists journeys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  name text not null,
  trigger text not null default 'manual'
    check (trigger in ('first_gift','lapsed','manual')),
  status text not null default 'active'
    check (status in ('active','paused')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journeys_org_idx on journeys (org_id);

create table if not exists journey_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  journey_id uuid not null references journeys(id) on delete cascade,
  step_order int not null,           -- 0-based
  delay_days int not null default 0, -- days after enrollment (step 0) / prior step
  subject text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (journey_id, step_order)
);
create index if not exists journey_steps_journey_idx on journey_steps (journey_id);

create table if not exists journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  journey_id uuid not null references journeys(id) on delete cascade,
  constituent_id uuid not null references constituents(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  current_step int not null default 0,
  next_run_at timestamptz not null default now(),
  last_step_at timestamptz,
  enrolled_at timestamptz not null default now(),
  unique (journey_id, constituent_id)
);
create index if not exists journey_enrollments_due_idx on journey_enrollments (next_run_at)
  where status = 'active';

do $$
declare
  aa uuid;
  t text;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute 'drop trigger if exists journeys_set_updated_at on journeys';
  execute 'create trigger journeys_set_updated_at before update on journeys for each row execute function set_updated_at()';

  foreach t in array array['journeys','journey_steps','journey_enrollments'] loop
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
