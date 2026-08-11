-- BloomOS Strategy — plan archives (supersede, don't delete).
-- A superseded OGSM is copied verbatim into one jsonb row per plan: objectives,
-- goals, initiatives (strategies), KPIs (measures), and every KPI snapshot, so
-- replacing the live plan never destroys history. No product surface reads this
-- table; it is a preservation record written by hand in the Supabase SQL editor
-- (see 2027_ogsm_v3_phase1_archive.MANUAL.sql).
-- RLS: members may read (reports.read, mirroring the plan_* pattern); there are
-- deliberately NO write policies — archives are written service-path only and
-- are immutable from the app's point of view.

create table if not exists plan_archives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  label text not null,           -- e.g. '2026-ogsm-v2'
  note text,                     -- one line on why it was superseded
  payload jsonb not null,        -- { objectives, goals, initiatives, kpis, kpi_snapshots }
  created_at timestamptz not null default now()
);
create unique index if not exists plan_archives_org_label_uniq on plan_archives (org_id, label);

do $$
begin
  execute 'alter table public.plan_archives enable row level security';

  drop policy if exists "members read plan_archives" on public.plan_archives;
  create policy "members read plan_archives" on public.plan_archives
    for select to authenticated
    using ( (select private.has_permission(org_id, 'reports.read')) );

  -- No insert/update/delete policies on purpose: deny-all for authenticated,
  -- written only via the service path / SQL editor.
end $$;
