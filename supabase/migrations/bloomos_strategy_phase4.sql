-- BloomOS Strategy, Phase 4 (specs/bloomos-strategy.md) — the monthly review.
-- One row per OGSM review session: when it happened, who ran it, the notes, and
-- the next review date. Counting this year's rows is the honest source for the
-- "reviews completed this year" KPI (it comes from the review mode itself), and
-- the latest row's next_review_at drives the cockpit's review nudge.
--
-- Additive only — safe to apply before the Phase 4 code deploys. Mirrors the
-- plan_* RLS/trigger pattern from create_kpis_and_plan.sql, MINUS the org_id
-- default (the org_id-default trap): org_id is set from session in the route.
-- Access: read = reports.read, write = org.manage, via has_permission.

create table if not exists plan_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  conducted_at timestamptz not null default now(),
  conducted_by text,
  notes text,
  next_review_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_reviews_org_idx on plan_reviews (org_id, conducted_at desc);

do $$
begin
  execute 'alter table public.plan_reviews enable row level security';

  drop policy if exists "members read plan_reviews" on public.plan_reviews;
  create policy "members read plan_reviews" on public.plan_reviews
    for select to authenticated
    using ( (select private.has_permission(org_id, 'reports.read')) );

  drop policy if exists "managers write plan_reviews" on public.plan_reviews;
  create policy "managers write plan_reviews" on public.plan_reviews
    for all to authenticated
    using ( (select private.has_permission(org_id, 'org.manage')) )
    with check ( (select private.has_permission(org_id, 'org.manage')) );

  drop trigger if exists plan_reviews_set_updated_at on plan_reviews;
  create trigger plan_reviews_set_updated_at before update on plan_reviews
    for each row execute function set_updated_at();
end $$;
