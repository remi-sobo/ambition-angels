-- BloomOS Finance — Revenue Schedule (spec: bloomosrevenueschedule.md, Phase 1)
--
-- One canonical, read-only dated schedule of expected inflows that finance,
-- runway, the pledges page and (later) Horizon all read from. Source of truth
-- stays in the underlying tables; this view is the single read surface so the
-- four representations of incoming money can never disagree again.
--
-- Two objects:
--   1. grant_payments  — small table so an awarded grant can be scheduled as
--      dated tranches. Correct multi-tenant shape: org_id NOT NULL with NO
--      column default (the AA-default "trap" the other tenant tables still
--      carry), set explicitly by the insert path from the parent grant's org.
--   2. v_revenue_schedule — security_invoker view unioning pledge_payments,
--      awarded grants (tranches when scheduled, else a lump at period_start),
--      open weighted pipeline (opportunities), and manual one-off commitments.
--
-- WHERE-clause is the contract (failure mode: pipeline noise). Verified against
-- live recon 2026-06-26: grants → 6 rows / $8,818.25; pipeline → 4 rows /
-- $170,000 gross / $66,500 weighted. pledges/manual empty today.
--
-- Apply via the Supabase dashboard. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).
-- Idempotent: create table/policies guard with IF [NOT] EXISTS / drop-recreate;
-- the view is create-or-replace.

-- ── 1. grant_payments ───────────────────────────────────────────────────────
create table if not exists public.grant_payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id),  -- NO default: set from the parent grant
  grant_id        uuid not null references public.grants(id) on delete cascade,
  due_date        date not null,
  expected_amount numeric not null check (expected_amount >= 0),
  status          text not null default 'scheduled'          -- scheduled | received
                  check (status in ('scheduled','received')),
  gift_id         uuid references public.gifts(id) on delete set null,
  received_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists grant_payments_grant_id_idx on public.grant_payments (grant_id);
create index if not exists grant_payments_org_id_idx   on public.grant_payments (org_id);
create index if not exists grant_payments_due_date_idx on public.grant_payments (due_date);

alter table public.grant_payments enable row level security;

drop policy if exists "members read grant_payments" on public.grant_payments;
create policy "members read grant_payments" on public.grant_payments
  for select to authenticated
  using ( (select private.has_permission(org_id, 'finance.read')) );

drop policy if exists "members write grant_payments" on public.grant_payments;
create policy "members write grant_payments" on public.grant_payments
  for all to authenticated
  using ( (select private.has_permission(org_id, 'finance.write')) )
  with check ( (select private.has_permission(org_id, 'finance.write')) );

-- ── 2. v_revenue_schedule ───────────────────────────────────────────────────
-- security_invoker so RLS on the underlying tables applies to the querying
-- user — a plain view would run as its owner and leak a second tenant's rows
-- (failure mode: "view bypasses RLS").
create or replace view public.v_revenue_schedule
with (security_invoker = true) as

  -- pledge_payments: committed, dated. Received installments (gift_id set) drop
  -- out — they're actuals now, counting them here would double-count runway.
  -- restricted: inherited from the parent pledge's fund; a pledge with a fund
  -- we can't resolve defaults restricted=true (conservative), no fund = general.
  select
    pp.org_id,
    'pledge'::text                                    as source_type,
    pp.id                                             as source_id,
    pp.pledge_id                                      as parent_id,
    coalesce(c.org_name,
             nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
             'Pledge')                                as label,
    date_trunc('month', pp.due_date)::date            as month,
    pp.due_date                                       as due_date,
    pp.expected_amount                                as gross_amount,
    pp.expected_amount                                as weighted_amount,
    'committed'::text                                 as confidence,
    coalesce(f.restricted, p.fund_id is not null)     as restricted,
    f.name                                            as restricted_to,
    pp.status                                         as status,
    false                                             as needs_schedule
  from public.pledge_payments pp
  join public.pledges p          on p.id = pp.pledge_id
  left join public.constituents c on c.id = p.constituent_id
  left join public.funds f        on f.id = p.fund_id
  where pp.status in ('scheduled','overdue')

  union all

  -- grant tranches: when an awarded grant has scheduled grant_payments, each
  -- one is a dated committed row.
  select
    gp.org_id,
    'grant'::text,
    gp.id,
    g.id,
    coalesce(g.name, 'Grant'),
    date_trunc('month', gp.due_date)::date,
    gp.due_date,
    gp.expected_amount,
    gp.expected_amount,
    'committed'::text,
    (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name,
    'awarded'::text,
    false
  from public.grant_payments gp
  join public.grants g           on g.id = gp.grant_id
  left join public.funds gf      on gf.id = g.fund_id
  where gp.status = 'scheduled'

  union all

  -- awarded grants with NO tranche schedule yet: lump the whole award at the
  -- period_start month (fallback to created_at) and flag needs_schedule so it
  -- counts toward runway but visibly wants tranching (failure mode: awarded
  -- money vanishing).
  select
    g.org_id,
    'grant'::text,
    g.id,
    g.id,
    coalesce(g.name, 'Grant'),
    date_trunc('month', coalesce(g.period_start, g.created_at::date))::date,
    coalesce(g.period_start, g.created_at::date),
    g.amount_awarded,
    g.amount_awarded,
    'committed'::text,
    (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name,
    'awarded'::text,
    true
  from public.grants g
  left join public.funds gf on gf.id = g.fund_id
  where g.amount_awarded is not null
    and g.amount_awarded > 0
    and g.stage in ('awarded', 'active', 'closed')
    and not exists (
      select 1 from public.grant_payments gp
      where gp.grant_id = g.id and gp.status = 'scheduled'
    )

  union all

  -- open weighted pipeline: opportunities not lost/won, dated in the future,
  -- with an ask. weighted = ask × probability%. Undated / past / zero-ask are
  -- excluded by the WHERE — they can't be tiered and would be noise.
  select
    o.org_id,
    'pipeline'::text,
    o.id,
    o.id,
    coalesce(o.name, 'Opportunity'),
    date_trunc('month', o.expected_close)::date,
    o.expected_close,
    o.ask_amount,
    round(o.ask_amount * coalesce(o.probability, 0) / 100.0, 2),
    'projected'::text,
    false,
    null::text,
    'open'::text,
    false
  from public.opportunities o
  where o.stage not in ('lost', 'steward')
    and o.expected_close >= current_date
    and o.ask_amount > 0

  union all

  -- manual one-off commitments (a verbal board commitment not in HubSpot).
  -- external_ref set means it mirrors a HubSpot deal — excluded so it isn't
  -- double-counted against the pipeline branch. Received manual rows are
  -- actuals; only secured/projected with a date land here.
  select
    rc.org_id,
    'manual'::text,
    rc.id,
    rc.id,
    coalesce(rc.source_name, 'Manual commitment'),
    date_trunc('month', rc.expected_date)::date,
    rc.expected_date,
    rc.amount,
    case when rc.status = 'projected'
         then round(rc.amount * coalesce(rc.probability, 1), 2)
         else rc.amount end,
    case when rc.status = 'secured' then 'committed' else 'projected' end,
    coalesce(rc.restricted, false),
    rc.restricted_to,
    rc.status,
    false
  from public.fin_revenue_commitments rc
  where rc.external_ref is null
    and rc.status in ('secured', 'projected')
    and rc.expected_date is not null;

comment on view public.v_revenue_schedule is
  'Canonical dated schedule of expected inflows (pledges, grants, weighted pipeline, manual). security_invoker — RLS of the underlying tables applies. Read by finance runway, the revenue/pledges pages, and Horizon. Never read hs_deals for finance numbers; pipeline comes from opportunities.';

-- security_invoker means the querying role still needs SELECT on the view
-- itself; grant it to authenticated so RLS-scoped readers (e.g. the Reed agent)
-- can read it. Underlying-table RLS still governs which rows they see.
grant select on public.v_revenue_schedule to authenticated;
