-- Fix what counts as "due" money in the revenue schedule / forward runway.
--
-- Two corrections to v_revenue_schedule (reported by Shannon — "$125k due by end
-- of June" wasn't showing):
--
-- 1. COMMITMENT BRANCH — count OVERDUE commitments, not just future ones.
--    surface_committed_deals_in_revenue_schedule.sql only counted AIG/Pledged
--    deals with expected_close >= today. But four committed gifts dated late
--    May / June 1 (Bisconti $50k, Mindy $25k, Colleen $25k, SV2 $25k = $125k)
--    are committed and NOT yet received — genuinely outstanding, just past their
--    expected date. Dropping the future-only filter surfaces them; the
--    gift-dedup guard (dedup_commitments_against_gifts.sql) still drops any that
--    have actually been received, so overdue-and-received duplicates don't leak.
--
-- 2. GRANT-LUMP BRANCH — stop counting CLOSED grants.
--    Awarded grants with no tranche schedule get lumped at their period_start.
--    For 'closed' grants that date is in the past and the money is already in
--    the bank (e.g. PACF FY23 $5k), so counting the lump as a future inflow
--    double-counts against cash. Closed grants are done — only 'awarded'/'active'
--    grants belong in the forward schedule.
--
-- (A third correction — keeping weighted *pipeline* out of the "due" tier — is a
-- pure-logic change in lib/finance/runway.ts, not here.)
--
-- Idempotent (create or replace view). Apply via the Supabase dashboard.

create or replace view public.v_revenue_schedule
with (security_invoker = true) as

  -- pledge_payments: committed, dated.
  select
    pp.org_id, 'pledge'::text as source_type, pp.id as source_id, pp.pledge_id as parent_id,
    coalesce(c.org_name, nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), 'Pledge') as label,
    date_trunc('month', pp.due_date)::date as month, pp.due_date as due_date,
    pp.expected_amount as gross_amount, pp.expected_amount as weighted_amount,
    'committed'::text as confidence, coalesce(f.restricted, p.fund_id is not null) as restricted,
    f.name as restricted_to, pp.status as status, false as needs_schedule
  from public.pledge_payments pp
  join public.pledges p          on p.id = pp.pledge_id
  left join public.constituents c on c.id = p.constituent_id
  left join public.funds f        on f.id = p.fund_id
  where pp.status in ('scheduled','overdue')

  union all

  -- grant tranches: scheduled grant_payments.
  select
    gp.org_id, 'grant'::text, gp.id, g.id, coalesce(g.name, 'Grant'),
    date_trunc('month', gp.due_date)::date, gp.due_date, gp.expected_amount, gp.expected_amount,
    'committed'::text, (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name, 'awarded'::text, false
  from public.grant_payments gp
  join public.grants g           on g.id = gp.grant_id
  left join public.funds gf      on gf.id = g.fund_id
  where gp.status = 'scheduled'

  union all

  -- awarded grants with NO tranche schedule yet: lump at period_start. Only
  -- in-progress grants ('awarded'/'active'); 'closed' grants are already
  -- received and would double-count against cash.
  select
    g.org_id, 'grant'::text, g.id, g.id, coalesce(g.name, 'Grant'),
    date_trunc('month', coalesce(g.period_start, g.created_at::date))::date,
    coalesce(g.period_start, g.created_at::date), g.amount_awarded, g.amount_awarded,
    'committed'::text, (coalesce(gf.restricted, false) or (coalesce(trim(g.restrictions), '') <> '')),
    gf.name, 'awarded'::text, true
  from public.grants g
  left join public.funds gf on gf.id = g.fund_id
  where g.amount_awarded is not null and g.amount_awarded > 0
    and g.stage in ('awarded', 'active')
    and not exists (
      select 1 from public.grant_payments gp
      where gp.grant_id = g.id and gp.status = 'scheduled'
    )

  union all

  -- open weighted pipeline: opportunities not lost/won, dated, with an ask.
  select
    o.org_id, 'pipeline'::text, o.id, o.id, coalesce(o.name, 'Opportunity'),
    date_trunc('month', o.expected_close)::date, o.expected_close, o.ask_amount,
    round(o.ask_amount * coalesce(o.probability, 0) / 100.0, 2),
    'projected'::text, false, null::text, 'open'::text, false
  from public.opportunities o
  where o.stage not in ('lost', 'steward')
    and o.expected_close >= current_date and o.ask_amount > 0

  union all

  -- committed AIG Member (3448542950) + Pledged (59189578) deals at full value.
  -- Includes OVERDUE (past-dated) commitments — committed money that hasn't
  -- landed yet. GUARD: skip any whose money has already arrived as a gift
  -- (constituent + amount + ±7 days) so a received/duplicate deal can't count
  -- as both a gift and a commitment.
  select
    o.org_id, 'commitment'::text, o.id, o.id, coalesce(o.name, 'Commitment'),
    date_trunc('month', o.expected_close)::date, o.expected_close, o.ask_amount, o.ask_amount,
    'committed'::text, false, null::text, 'committed'::text, false
  from public.opportunities o
  where o.external_stage in ('3448542950', '59189578')
    and o.ask_amount > 0
    and not exists (
      select 1 from public.gifts g
      where g.constituent_id = o.constituent_id
        and g.amount = o.ask_amount
        and abs(g.gift_date - o.expected_close) <= 7
    )

  union all

  -- manual one-off commitments (fin_revenue_commitments).
  select
    rc.org_id, 'manual'::text, rc.id, rc.id, coalesce(rc.source_name, 'Manual commitment'),
    date_trunc('month', rc.expected_date)::date, rc.expected_date, rc.amount,
    case when rc.status = 'projected' then round(rc.amount * coalesce(rc.probability, 1), 2) else rc.amount end,
    case when rc.status = 'secured' then 'committed' else 'projected' end,
    coalesce(rc.restricted, false), rc.restricted_to, rc.status, false
  from public.fin_revenue_commitments rc
  where rc.external_ref is null and rc.status in ('secured', 'projected') and rc.expected_date is not null;

comment on view public.v_revenue_schedule is
  'Canonical dated schedule of expected inflows (pledges, grants, weighted pipeline, committed AIG/Pledged deals incl. overdue, manual). Commitment rows are deduped against received gifts (constituent+amount+-7d); closed grants are excluded (already received). security_invoker. Never read hs_deals for finance numbers; pipeline + commitments come from opportunities.';

grant select on public.v_revenue_schedule to authenticated;
