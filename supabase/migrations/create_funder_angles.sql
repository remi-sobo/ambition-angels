-- Strategy tab, Phase 2 — the funnel object.
--
-- funder_angles is the join between a constituent (the funder, on the spine)
-- and a strategy_angle (the lens we're approaching them through), carrying the
-- funnel stage, the go/no-go decision, cheap triage notes, and — once pursued
-- in Phase 3 — the linked opportunity. One row per (funder, angle): a funder
-- can be worked under several angles, but never twice under the same one.
--
-- Conventions match create_opportunities.sql / create_strategy_angles.sql:
-- resident-org default, set_updated_at trigger, fundraising-domain RLS. Applied
-- by hand in the Supabase SQL editor. Nothing here touches the HubSpot mirror.

create table if not exists funder_angles (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  constituent_id uuid not null references constituents(id) on delete cascade,
  angle_id       uuid not null references strategy_angles(id) on delete cascade,
  stage          text not null default 'shortlist' check (stage in
                   ('shortlist','qualified','researched','pursuing','parked','passed')),
  decision       text check (decision is null or decision in ('pursue','park','pass')),
  fit_notes      text,
  -- Set on pursue (Phase 3); the funder then also lives on Major Gifts.
  opportunity_id uuid references opportunities(id) on delete set null,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (constituent_id, angle_id)
);
create index if not exists funder_angles_angle_idx       on funder_angles (angle_id);
create index if not exists funder_angles_constituent_idx on funder_angles (constituent_id);
create index if not exists funder_angles_stage_idx       on funder_angles (angle_id, stage);

do $$
declare
  aa uuid;
  t text := 'funder_angles';
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
      using ( (select private.has_permission(org_id, 'fundraising.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.write')) )
      with check ( (select private.has_permission(org_id, 'fundraising.write')) )
    $p$, 'members write ' || t, t);
end $$;
