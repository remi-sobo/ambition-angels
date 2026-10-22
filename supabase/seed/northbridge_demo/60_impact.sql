-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — Impact, metrics, strategic plan
--   * Metric Catalog: 17 metric_definitions + ~16 months of metric_snapshots
--     (monthly for hand-entered metrics, weekly + today for computed ones).
--   * Strategic plan "Northbridge <fy+1>" (FY<fy-1>–FY<fy+1>): foundation,
--     4 objectives, 12 goals, 34 initiatives, 26 KPIs (+ plan_kpi_snapshots),
--     6 plan reviews, objective notes + tasks, and the prior plan's archive.
--   * Strategy angles (the 8 funding "doors" the Narrative and the
--     Fundraising → Strategy board read) + strategy_room_meta.
--   * Impact report artifacts: documents rows (doc_type 'impact_report') for
--     exported reports + export_waivers that travel with them.
--
-- Computed metrics are the app's own resolvers (lib/admin/metrics/resolvers.ts,
-- lib/admin/plan/metrics.ts), which the daily /api/cron/metric-snapshots job
-- re-captures from LIVE rows. So this section reads the rows Sections 3a/3b/5
-- seeded (students, recurring_plans, opportunities, attendance, gifts) and
-- makes "today's" snapshot equal to what the resolver will compute, with the
-- history scaled (or, for gifts/attendance, computed exactly) to lead into it.
-- When those rows are absent (a stand-alone apply), story values are used.
--
-- Wiring rules honored (see the report for why):
--   * Auto KPIs (plan_kpis.source='auto') use PLAN_METRICS keys only, carry
--     metric_id → their computed definition, and get the status kpiHealth()
--     would compute, so the cron never flips them.
--   * Computed definitions not linked from an auto KPI (attendance_rate,
--     funds_raised_fy) stay unlinked so captureUnlinkedComputedMetrics keeps
--     capturing them. Computed definitions are ownerless (house noise guard).
--   * cash_runway_months / monthly_burn are NOT computed here: those resolvers
--     read getFinanceSnapshot() without an org, which under the sessionless
--     cron resolves to the resident (Ambition Angels) org.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── Section-local helpers (pg_temp; nothing persists) ───────────────────────
create or replace function pg_temp.nb6_at(dt date, hhmi text default '16:00') returns timestamptz
  language sql stable
  as $$ select (dt::text || ' ' || hhmi)::timestamp at time zone 'America/Los_Angeles' $$;

-- Fiscal-month index (Jul = 0 … Jun = 11) and fiscal year (named by end year).
create or replace function pg_temp.nb6_fyidx(dt date) returns int language sql immutable
  as $$ select (extract(month from dt)::int + 5) % 12 $$;
create or replace function pg_temp.nb6_fy(dt date) returns int language sql immutable
  as $$ select extract(year from dt)::int + case when extract(month from dt) >= 7 then 1 else 0 end $$;
create or replace function pg_temp.nb6_fystart(dt date) returns date language sql immutable
  as $$ select make_date(pg_temp.nb6_fy(dt) - 1, 7, 1) $$;

-- Share of a fiscal year's total reached by date dt, from 12 end-of-month
-- cumulative shares (linear inside the month).
create or replace function pg_temp.nb6_share(eom numeric[], dt date) returns numeric language sql immutable as $$
  select prev + (eom[idx + 1] - prev)
         * ((extract(day from dt) - 1) / extract(day from (date_trunc('month', dt) + interval '1 month - 1 day')))
  from (select pg_temp.nb6_fyidx(dt) as idx) a,
       lateral (select case when a.idx = 0 then 0::numeric else eom[a.idx] end as prev) b
$$;

-- 0 → 1 across the ~16 months the history covers.
create or replace function pg_temp.nb6_prog(dt date) returns numeric language sql stable
  as $$ select greatest(0, least(1, (dt - (pg_temp.nb_anchor() - 490))::numeric / 490)) $$;

-- The plan's board-approval day (May before FY<fy-1> began).
create or replace function pg_temp.nb6_launch() returns date language sql stable
  as $$ select make_date(pg_temp.fy() - 2, 5, 20) $$;

-- kpiHealth() from lib/admin/plan/metrics.ts, verbatim (calendar-year pacing),
-- evaluated at the anchor — the status the cron will write for an auto KPI.
create or replace function pg_temp.nb6_kpihealth(cur numeric, target numeric) returns text language sql stable as $$
  select case
    when target is null or target <= 0 then 'not_started'
    when cur >= target then 'on_track'
    when cur = 0 and f < 0.1 then 'not_started'
    when cur / (target * f) >= 0.9 then 'on_track'
    when cur / (target * f) >= 0.6 then 'at_risk'
    else 'behind' end
  from (select greatest(
          (pg_temp.nb_anchor() - make_date(extract(year from pg_temp.nb_anchor())::int, 1, 1) + 0.5)::numeric
          / (make_date(extract(year from pg_temp.nb_anchor())::int + 1, 1, 1) - make_date(extract(year from pg_temp.nb_anchor())::int, 1, 1)),
          0.01) as f) x
$$;

-- Story curves (used when another section's live rows are absent, and as the
-- shape the live value is scaled into).
create or replace function pg_temp.nb6_story_active(dt date) returns numeric language sql stable as $$
  select (195 + 37 * pg_temp.nb6_prog(dt))
         * case extract(month from dt)::int when 6 then 0.93 when 7 then 0.80 when 8 then 0.88 else 1 end
$$;
create or replace function pg_temp.nb6_story_donors(dt date) returns numeric language sql stable as $$
  select 31 + 14 * pg_temp.nb6_prog(dt) + case extract(month from dt)::int when 12 then 1.5 else 0 end
$$;
create or replace function pg_temp.nb6_story_pipeline(dt date) returns numeric language sql stable as $$
  select (380000 + 140000 * pg_temp.nb6_prog(dt))
         * case extract(month from dt)::int when 11 then 1.10 when 12 then 1.12 when 1 then 0.92 when 6 then 0.86 else 1 end
$$;
-- Attendance has no July value (no cohort meets): returns null.
create or replace function pg_temp.nb6_story_att(dt date) returns numeric language sql stable as $$
  select (array[84, 86, 87, 85, 83, 86, null, 89, 88, 86.4, 85, 82]::numeric[])[extract(month from dt)::int]
         + 1.2 * (pg_temp.nb6_prog(dt) - 1)
$$;
-- Gifts received, FY to date (end-of-month cumulative shares; December and
-- the spring gala carry the year).
create or replace function pg_temp.nb6_story_gifts(dt date) returns numeric language sql stable as $$
  select case pg_temp.fy() - pg_temp.nb6_fy(dt) when 0 then 3200000 when 1 then 2950000 else 2700000 end
         * pg_temp.nb6_share(array[.07, .13, .19, .24, .31, .47, .52, .56, .62, .70, .83, 1.0]::numeric[], dt)
$$;

-- ── Live values from other sections' rows (temp, dropped at commit) ─────────
create temp table nb6_live (k text primary key, v numeric) on commit drop;

insert into nb6_live (k, v)
with fy as (
  select coalesce(
           (select case when coalesce(fiscal_year_start_month, 1) = 1 then make_date(current_year, 1, 1)
                        else make_date(current_year - 1, fiscal_year_start_month, 1) end
              from public.fin_config where org_id = pg_temp.nb_org()),
           pg_temp.fy_start()) as s,
         coalesce(
           (select case when coalesce(fiscal_year_start_month, 1) = 1 then make_date(current_year, 12, 31)
                        else make_date(current_year, fiscal_year_start_month, 1) - 1 end
              from public.fin_config where org_id = pg_temp.nb_org()),
           make_date(pg_temp.fy(), 6, 30)) as e
),
g as (
  select gf.amount, gf.gift_date, c.type as ctype
  from public.gifts gf
  left join public.constituents c on c.id = gf.constituent_id
  cross join fy
  where gf.org_id = pg_temp.nb_org() and gf.gift_date between fy.s and fy.e
)
select 'active_teens', count(*)::numeric
  from public.students s
  where s.org_id = pg_temp.nb_org()
    and s.stage in (select stage_key from public.participant_stages
                    where org_id = pg_temp.nb_org() and engaged)
union all
select 'monthly_donors', count(*)::numeric
  from public.recurring_plans where org_id = pg_temp.nb_org() and status = 'active'
union all
select 'weighted_pipeline', round(coalesce(sum(o.ask_amount * coalesce(o.probability, 50) / 100.0), 0), 2)
  from public.opportunities o
  where o.org_id = pg_temp.nb_org()
    and o.stage = any (array['identify','qualify','cultivate','solicit','identified','researched',
                             'needs_appointment','appointment_scheduled','meeting_complete','ask_made',
                             'pledged','pitched','big_3_idd','linkedin_mined','outreach_sent','meetings_scheduled'])
    and (o.pipeline is null or (o.pipeline <> '59855776' and o.pipeline <> 'archived_partnership'))
union all
-- The A6 house formula: (present + late) / (present + late + absent), active
-- cohorts, held sessions, trailing 21 days. Null when nothing is countable.
select 'attendance_rate',
       round(100.0 * sum((a.status in ('present','late'))::int)
             / nullif(sum((a.status in ('present','late','absent'))::int), 0), 2)
  from public.attendance a
  join public.cohort_sessions cs on cs.id = a.session_id
  join public.cohorts co on co.id = cs.cohort_id
  where a.org_id = pg_temp.nb_org() and cs.org_id = pg_temp.nb_org() and co.org_id = pg_temp.nb_org()
    and co.status = 'active' and cs.status = 'held' and cs.session_date >= pg_temp.d(-21)
union all
select 'attendance_rows', count(*)::numeric from public.attendance where org_id = pg_temp.nb_org()
union all
select 'gift_rows', count(*)::numeric from public.gifts where org_id = pg_temp.nb_org()
union all
select 'secured_fy', coalesce(sum(amount), 0) from g
union all
select 'gifts_10k', count(*) filter (where amount >= 10000)::numeric from g
union all
select 'corporate_fy', coalesce(sum(amount) filter (where ctype = 'organization'), 0) from g;

-- Resolved "today" values (live when present, story otherwise) + the targets
-- the auto KPIs carry (human-set goals a notch above the live level).
insert into nb6_live (k, v)
select 'now_active',   coalesce((select v from nb6_live where k = 'active_teens' and v >= 25), round(pg_temp.nb6_story_active(pg_temp.d(0))))
union all
select 'now_donors',   coalesce((select v from nb6_live where k = 'monthly_donors' and v >= 10), round(pg_temp.nb6_story_donors(pg_temp.d(0))))
union all
select 'now_pipeline', coalesce((select v from nb6_live where k = 'weighted_pipeline' and v >= 50000), round(pg_temp.nb6_story_pipeline(pg_temp.d(0)), -2))
union all
select 'now_att',      coalesce((select v from nb6_live where k = 'attendance_rate'
                                  and (select v from nb6_live where k = 'attendance_rows') >= 200),
                                coalesce(pg_temp.nb6_story_att(pg_temp.d(0)), 86.2))
union all
select 'now_secured',  coalesce((select v from nb6_live where k = 'secured_fy' and v >= 50000), round(pg_temp.nb6_story_gifts(pg_temp.d(0)), -2))
union all
select 'now_10k',      coalesce((select v from nb6_live where k = 'gifts_10k' and v >= 1
                                  and (select v from nb6_live where k = 'secured_fy') >= 50000), 12)
union all
select 'now_corp',     coalesce((select v from nb6_live where k = 'corporate_fy' and v >= 10000), 185000);

insert into nb6_live (k, v)
select 't_active',   greatest(260, ceil((select v from nb6_live where k = 'now_active') * 1.12 / 10) * 10)
union all
select 't_donors',   greatest(60, ceil((select v from nb6_live where k = 'now_donors') * 1.25 / 5) * 5)
union all
select 't_pipeline', greatest(600000, ceil((select v from nb6_live where k = 'now_pipeline') * 1.15 / 50000) * 50000);

create or replace function pg_temp.nb6_v(key text) returns numeric language sql stable
  as $$ select v from nb6_live where k = key $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Metric Catalog — definitions
-- ════════════════════════════════════════════════════════════════════════════
insert into public.metric_definitions
  (id, org_id, metric_key, name, description, department, unit, direction, cadence,
   source_kind, source_key, target, baseline, baseline_date, owner_id, active,
   numerator, denominator, population, confirmed_state, created_at, updated_at)
select pg_temp.nb_id('metric:' || m.k), pg_temp.nb_org(), m.k, m.name, m.descr, m.dept, m.unit, 'up', m.cadence,
       m.kind, m.skey, m.target, m.baseline, m.bdate,
       case when m.owner is null then null else pg_temp.nb_user(m.owner) end, true,
       m.num, m.den, m.pop, m.cstate,
       pg_temp.nb6_at(m.created, '11:00'), pg_temp.nb6_at(m.created, '11:00')
from (values
  ('youth_served', 'Youth served (fiscal year to date)',
   'Unduplicated young people who took part in at least one Northbridge program, internship, or workshop since July 1. Each person counts once per fiscal year, however many programs they join.',
   'program', null::text, 'monthly', 'manual', null::text, 800::numeric, 742::numeric, make_date(pg_temp.fy() - 1, 6, 30), 'ben',
   'Youth with at least one attended session, internship day, or mentor meeting this fiscal year', null::text,
   'Ages 14–24, all programs, unduplicated', 'confirmed', pg_temp.nb6_launch()),
  ('active_participants', 'Active participants',
   'Participants whose journey stage is Enrolled right now. Computed every morning from participant records.',
   'program', null, 'weekly', 'computed', 'active_teens', pg_temp.nb6_v('t_active'), 195, pg_temp.d(-490), null,
   'Participants in an engaged journey stage', null, 'Every tracked participant', 'confirmed', pg_temp.nb6_launch()),
  ('attendance_rate', 'Attendance rate (last 3 weeks)',
   'Present or late, over every marked session in active cohorts during the trailing three weeks. Excused absences and unmarked sessions never count against anyone.',
   'program', 'pct', 'weekly', 'computed', 'attendance_rate', 85, 81, make_date(pg_temp.fy() - 2, 5, 31), null,
   'Present + late marks', 'Present + late + absent marks', 'Active cohorts, held sessions, trailing 21 days', 'confirmed', pg_temp.nb6_launch()),
  ('program_completion', 'Program completion rate',
   'Share of participants who finished their program cycle: Launchpad seniors with 80% attendance and a capstone, and Pathways fellows who graduated. Under review: the Hollis agreement counts completion only when a fellow earns a certification.',
   'program', 'pct', 'quarterly', 'manual', null, 85, 79, make_date(pg_temp.fy() - 2, 6, 30), 'ben',
   'Participants who completed the cycle', 'Participants enrolled at the start of the cycle',
   'Launchpad seniors and Pathways fellows, most recent cycle', 'conflict', pg_temp.nb6_launch()),
  ('placement_rate', 'Job placement at 90 days',
   'Pathways graduates working at least 20 hours a week within 90 days of graduation, for the most recent graduating cohort.',
   'program', 'pct', 'monthly', 'manual', null, 80, 71, pg_temp.summer_start() - 2 - 364 + 90, 'andre',
   'Graduates employed 20+ hours a week within 90 days', 'Graduates of the cohort',
   'Pathways Fellowship graduates, most recent cohort', 'confirmed', pg_temp.nb6_launch()),
  ('avg_starting_wage', 'Average starting wage ($/hr)',
   'Average hourly starting wage for Pathways graduates placed within 90 days, most recent cohort. Oakland''s minimum wage is the floor every placement clears.',
   'program', null, 'monthly', 'manual', null, 25, 22.8, pg_temp.summer_start() - 2 - 364 + 90, 'andre',
   'Sum of starting hourly wages', 'Graduates placed within 90 days',
   'Pathways Fellowship graduates placed, most recent cohort', 'confirmed', pg_temp.nb6_launch()),
  ('credentials_earned', 'Industry credentials earned (last 12 months)',
   'CompTIA A+, CNA, medical assistant, OSHA-10, and pre-apprenticeship certificates earned by fellows in the trailing 12 months.',
   'program', null, 'monthly', 'manual', null, 65, 41, pg_temp.d(-485), 'andre',
   'Credentials earned', null, 'Pathways fellows, trailing 12 months', 'confirmed', pg_temp.nb6_launch()),
  ('mentor_matches', 'Active mentor matches',
   'Youth paired with a trained, background-checked volunteer mentor who met with them in the last 60 days.',
   'program', null, 'monthly', 'manual', null, 60, 38, pg_temp.d(-485), 'simone',
   'Matches with a meeting in the last 60 days', null, 'Mentor Circles youth and Pathways fellows', 'confirmed', pg_temp.nb6_launch()),
  ('summer_interns', 'Summer Works paid interns',
   'Young people who completed a paid Summer Works internship this summer: seven weeks, at least 20 hours a week, paid on time every Friday.',
   'program', null, 'quarterly', 'manual', null, 100, 72, pg_temp.summer_start() - 364 + 50, 'simone',
   'Interns who completed the seven weeks', null, 'Summer Works, ages 16–21', 'confirmed', pg_temp.nb6_launch()),
  ('employer_partners', 'Active employer partners',
   'Employers who hosted an intern, hired a graduate, or committed placements in the last 12 months.',
   'program', null, 'monthly', 'manual', null, 30, 18, pg_temp.d(-485), 'simone',
   'Employers with a placement or hire in the last 12 months', null, 'All employer partners', 'confirmed', pg_temp.nb6_launch()),
  ('donor_retention', 'Donor retention rate',
   'Donors who gave in the prior 12 months and gave again in the most recent 12 months. Being re-checked after the donor data cleanup, so treat the last two points as provisional.',
   'fundraising', 'pct', 'quarterly', 'manual', null, 70, 58, make_date(pg_temp.fy() - 2, 6, 30), 'priya',
   'Prior-year donors who gave again', 'Donors who gave in the prior 12 months', 'Individual donors, all channels', 'unconfirmed', pg_temp.nb6_launch()),
  ('monthly_donors', 'Monthly donors',
   'Active recurring giving plans. Computed every morning from the recurring gifts ledger.',
   'fundraising', null, 'weekly', 'computed', 'monthly_donors', pg_temp.nb6_v('t_donors'), 31, pg_temp.d(-490), null,
   'Active recurring plans', null, 'Monthly giving circle', 'confirmed', pg_temp.nb6_launch()),
  ('weighted_pipeline', 'Weighted pipeline',
   'Open asks times their probability across the major gifts and corporate pipelines. Won, lost, and on-hold asks are left out so no dollar counts twice.',
   'fundraising', 'usd', 'weekly', 'computed', 'weighted_pipeline_fy26', pg_temp.nb6_v('t_pipeline'), 380000, pg_temp.d(-490), null,
   'Σ open ask × probability', null, 'Open opportunities, all pipelines', 'confirmed', pg_temp.nb6_launch()),
  ('funds_raised_fy', 'Gifts received (fiscal year to date)',
   'Every gift dated since July 1, all funds and sources. Computed every morning; the same figure the strategy narrative reports as secured.',
   'fundraising', 'usd', 'weekly', 'computed', 'dollars_raised_fy26', 3400000, 2950000, make_date(pg_temp.fy() - 1, 6, 30), null,
   'Σ gift amounts this fiscal year', null, 'All gifts', 'confirmed', pg_temp.nb6_launch()),
  ('months_of_runway', 'Months of runway',
   'Cash on hand at the month-end close divided by average monthly operating expense. The board''s reserve target is six months.',
   'finance', 'months', 'monthly', 'manual', null, 6, 4.6, pg_temp.d(-485), 'kwame',
   'Cash on hand at close', 'Average monthly operating expense (trailing 3 months)', 'Operating cash, all accounts', 'confirmed', pg_temp.nb6_launch()),
  ('staff_retention', 'Staff retention (last 12 months)',
   'Staff employed 12 months ago who are still with Northbridge today.',
   'ops', 'pct', 'quarterly', 'manual', null, 85, 82, make_date(pg_temp.fy() - 2, 6, 30), 'tasha',
   'Staff still employed', 'Staff employed 12 months ago', 'All full- and part-time staff', 'confirmed', pg_temp.nb6_launch()),
  ('peer_programs', 'Peer programs using the playbook',
   'Youth employment programs outside Northbridge that have adopted at least one chapter of the employer partnership playbook.',
   'strategy', null, 'quarterly', 'manual', null, 3, 0, make_date(pg_temp.fy() - 1, 6, 30), 'remi',
   'Programs with a signed playbook agreement', null, 'Bay Area youth employment programs', 'confirmed', pg_temp.nb6_launch())
) as m(k, name, descr, dept, unit, cadence, kind, skey, target, baseline, bdate, owner, num, den, pop, cstate, created)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Metric snapshots — built into a temp table first (plan KPIs reuse it)
-- ════════════════════════════════════════════════════════════════════════════
create temp table nb6_pts (
  metric_key text, captured_on date, value numeric, note text, by_handle text,
  primary key (metric_key, captured_on)
) on commit drop;

-- Monthly point dates for hand-entered metrics: day `off` of each of the last
-- 17 months, never later than yesterday.
create or replace function pg_temp.nb6_months(off int, lag_days int default 1)
  returns table (k int, c date) language sql stable as $$
  select g.k, pg_temp.mon(-g.k) + off
  from generate_series(0, 16) g(k)
  where pg_temp.mon(-g.k) + off <= pg_temp.d(-lag_days)
$$;
-- Quarterly point dates (Jan/Apr/Jul/Oct + off), newest first numbered q = 0…
create or replace function pg_temp.nb6_quarters(off int)
  returns table (q int, c date) language sql stable as $$
  select (row_number() over (order by g.k) - 1)::int, pg_temp.mon(-g.k) + off
  from generate_series(0, 19) g(k)
  where extract(month from pg_temp.mon(-g.k)) in (1, 4, 7, 10)
    and pg_temp.mon(-g.k) + off <= pg_temp.d(-1)
$$;
-- Computed-metric point dates: today + weekly for 12 weeks, then mid-month
-- back to ~16 months.
create or replace function pg_temp.nb6_auto_dates()
  returns table (c date) language sql stable as $$
  select pg_temp.d(-7 * j) from generate_series(0, 12) j
  union
  select pg_temp.mon(-k) + 14 from generate_series(3, 16) k
  where pg_temp.mon(-k) + 14 < pg_temp.d(-84)
$$;

-- youth_served — FY to date; a capture on day 9 reports through last month-end.
insert into nb6_pts
select 'youth_served', g.c,
       round(x.ann * x.sh * case when x.idx = 11 then 1 else 1 + (pg_temp.rnd('ys:' || g.k)::numeric - 0.5) * 0.02 end),
       case when x.idx = 11 then 'FY' || pg_temp.nb6_fy(pp.p) || ' final count, unduplicated across programs.'
            when x.idx = 0 then 'New fiscal year: Summer Works interns carry into July.' end,
       'ben'
from pg_temp.nb6_months(9) g,
     lateral (select (date_trunc('month', g.c) - interval '1 day')::date as p) pp,
     lateral (select pg_temp.nb6_fyidx(pp.p) as idx,
                     (array[.26, .44, .56, .61, .65, .68, .75, .79, .83, .86, .89, 1.0]::numeric[])[pg_temp.nb6_fyidx(pp.p) + 1] as sh,
                     case pg_temp.fy() - pg_temp.nb6_fy(pp.p) when 0 then 815 when 1 then 742 when 2 then 690 else 640 end as ann) x
on conflict do nothing;

-- active_participants — computed (active_teens); story shape scaled to live.
insert into nb6_pts
select 'active_participants', a.c,
       case when a.c = pg_temp.d(0) then pg_temp.nb6_v('now_active')
            else round(pg_temp.nb6_story_active(a.c) * (1 + (pg_temp.rnd('ap:' || a.c)::numeric - 0.5) * 0.03)
                       * pg_temp.nb6_v('now_active') / pg_temp.nb6_story_active(pg_temp.d(0))) end,
       null, null
from pg_temp.nb6_auto_dates() a
on conflict do nothing;

-- attendance_rate — computed; exact from attendance rows when a window has
-- marks, else the story value scaled to today's live rate. No July value.
insert into nb6_pts
select 'attendance_rate', a.c, round(v.val, 1), null, null
from pg_temp.nb6_auto_dates() a,
     lateral (
       select case
         when a.c = pg_temp.d(0) then pg_temp.nb6_v('now_att')
         else coalesce(
           (select 100.0 * sum((t.status in ('present','late'))::int)
                   / nullif(sum((t.status in ('present','late','absent'))::int), 0)
              from public.attendance t
              join public.cohort_sessions s on s.id = t.session_id
             where t.org_id = pg_temp.nb_org() and s.org_id = pg_temp.nb_org()
               and coalesce(pg_temp.nb6_v('attendance_rows'), 0) >= 200
               and s.status = 'held' and s.session_date between a.c - 21 and a.c),
           (pg_temp.nb6_story_att(a.c) + (pg_temp.rnd('ar:' || a.c)::numeric - 0.5) * 1.6)
             * pg_temp.nb6_v('now_att') / coalesce(pg_temp.nb6_story_att(pg_temp.d(0)), 86.2))
         end as val) v
where v.val is not null
on conflict do nothing;

-- program_completion — quarterly, hand-entered; the definition is in conflict.
insert into nb6_pts
select 'program_completion', q.c, (array[84, 83, 81, 80, 79, 78, 77]::numeric[])[q.q + 1],
       case q.q when 0 then 'Launchpad seniors and Pathways Cohort 6. By the Hollis definition (certification earned) the same cycle is 71%.' end,
       'ben'
from pg_temp.nb6_quarters(12) q
on conflict do nothing;

-- placement_rate / avg_starting_wage — the latest graduating cohort's 90-day
-- figure; steps up when Cohort 6 reaches its 90-day mark.
insert into nb6_pts
select 'placement_rate', g.c,
       case when g.c >= pg_temp.summer_start() - 2 + 90 then 78
            when g.c >= pg_temp.summer_start() - 2 - 364 + 90 then 71 else 66 end,
       case when g.c >= pg_temp.summer_start() - 2 + 90 and g.c - 31 < pg_temp.summer_start() - 2 + 90
              then 'Cohort 6 at 90 days: 25 of 32 graduates employed 20+ hours a week.'
            when g.c >= pg_temp.summer_start() - 2 - 364 + 90 and g.c - 31 < pg_temp.summer_start() - 2 - 364 + 90
              then 'Cohort 5 at 90 days: 22 of 31 graduates employed.' end,
       'andre'
from pg_temp.nb6_months(8) g
on conflict do nothing;

insert into nb6_pts
select 'avg_starting_wage', g.c,
       case when g.c >= pg_temp.summer_start() - 2 + 90 then 24.50
            when g.c >= pg_temp.summer_start() - 2 - 364 + 90 then 22.80 else 21.40 end,
       case when g.c >= pg_temp.summer_start() - 2 + 90 and g.c - 31 < pg_temp.summer_start() - 2 + 90
              then 'Cohort 6: range $19.50–$31.00. IT help-desk placements lead (Kinetic Labs at $28).' end,
       'andre'
from pg_temp.nb6_months(8) g
on conflict do nothing;

-- credentials_earned — trailing 12 months, climbing toward 65.
insert into nb6_pts
select 'credentials_earned', g.c,
       58 - round(17.0 * g.k / 16) + case when g.k between 1 and 15 then round((pg_temp.rnd('ce:' || g.k)::numeric - 0.5) * 2) else 0 end,
       case g.k when 0 then 'Includes 9 CompTIA A+ and 7 CNA certificates from Cohort 6''s final quarter.' end,
       'andre'
from pg_temp.nb6_months(10) g
on conflict do nothing;

-- mentor_matches — school-year rhythm (summer dip) on a rising line.
insert into nb6_pts
select 'mentor_matches', g.c,
       (array[44, 45, 46, 46, 45, 41, 33, 35, 42, 46, 47, 46]::numeric[])[extract(month from g.c)::int]
         + round(4 * (1 - g.k / 16.0)) - 2,
       case g.k when 0 then 'Kinetic Labs mentors fully matched; 9 youth waiting for a mentor.' end,
       'simone'
from pg_temp.nb6_months(6) g
on conflict do nothing;

-- summer_interns — one count per summer.
insert into nb6_pts
select 'summer_interns', s.c, s.v, s.note, 'simone'
from (values
  (pg_temp.summer_start() + 50,       85::numeric, '85 interns at 22 employers; every payroll on time.'),
  (pg_temp.summer_start() - 364 + 50, 72::numeric, '72 interns at 18 employers.'),
  (pg_temp.summer_start() - 728 + 50, 64::numeric, null::text)
) s(c, v, note)
where s.c <= pg_temp.d(-1)
on conflict do nothing;

-- employer_partners — deliberately past its cadence (the one stale metric).
insert into nb6_pts
select 'employer_partners', g.c, least(24, 18 + round(6.5 * (1 - g.k / 16.0))),
       case g.k when 1 then '22 Summer Works hosts plus Kinetic Labs and Harbor Health hiring.' end,
       'simone'
-- Newest point pinned at d(-43): just past its monthly cadence (a few days
-- overdue) at any anchor, instead of drifting with the day of the month.
from (select k, pg_temp.d(-43 - 30 * k) as c from generate_series(0, 16) k) g
on conflict do nothing;

-- donor_retention — quarterly, provisional while the data cleanup runs.
insert into nb6_pts
select 'donor_retention', q.c, (array[64, 63, 61, 60, 58, 57, 57]::numeric[])[q.q + 1],
       case q.q when 0 then 'Provisional: 41 duplicate donor records merged this quarter; Ben is re-running the lapsed window.' end,
       'priya'
from pg_temp.nb6_quarters(14) q
on conflict do nothing;

-- monthly_donors — computed; story scaled to the live count.
insert into nb6_pts
select 'monthly_donors', a.c,
       case when a.c = pg_temp.d(0) then pg_temp.nb6_v('now_donors')
            else round(pg_temp.nb6_story_donors(a.c) * pg_temp.nb6_v('now_donors') / pg_temp.nb6_story_donors(pg_temp.d(0))) end,
       null, null
from pg_temp.nb6_auto_dates() a
on conflict do nothing;

-- weighted_pipeline — computed; story scaled to the live weighted total.
insert into nb6_pts
select 'weighted_pipeline', a.c,
       case when a.c = pg_temp.d(0) then pg_temp.nb6_v('now_pipeline')
            else round(pg_temp.nb6_story_pipeline(a.c) * (1 + (pg_temp.rnd('wp:' || a.c)::numeric - 0.5) * 0.06)
                       * pg_temp.nb6_v('now_pipeline') / pg_temp.nb6_story_pipeline(pg_temp.d(0)), -2) end,
       null, null
from pg_temp.nb6_auto_dates() a
on conflict do nothing;

-- funds_raised_fy — computed; exact from gifts when Section 3 seeded them.
insert into nb6_pts
select 'funds_raised_fy', a.c,
       case when a.c = pg_temp.d(0) then pg_temp.nb6_v('now_secured')
            when coalesce(pg_temp.nb6_v('gift_rows'), 0) >= 50 then
              (select coalesce(sum(gf.amount), 0) from public.gifts gf
                where gf.org_id = pg_temp.nb_org()
                  and gf.gift_date between pg_temp.nb6_fystart(a.c) and a.c)
            else round(pg_temp.nb6_story_gifts(a.c), -2) end,
       null, null
from pg_temp.nb6_auto_dates() a
on conflict do nothing;

-- months_of_runway — Kwame enters it after each month-end close.
insert into nb6_pts
select 'months_of_runway', g.c,
       (array[5.5, 5.4, 5.1, 5.2, 5.3, 5.0, 4.9, 5.0, 5.1, 5.2, 4.9, 4.6, 4.4, 4.6, 4.8, 4.7, 4.6]::numeric[])[g.k + 1],
       case g.k when 0 then 'Close: $1.55M cash, $280K average monthly expense.'
                when 3 then 'FY close. Reserve policy adopted: six months by June.' end,
       'kwame'
from pg_temp.nb6_months(6) g
on conflict do nothing;

insert into nb6_pts
select 'staff_retention', q.c, (array[88, 87, 86, 85, 83, 82, 82]::numeric[])[q.q + 1],
       case q.q when 0 then '21 of 24 staff from a year ago are still here; two left for graduate school.' end,
       'tasha'
from pg_temp.nb6_quarters(15) q
on conflict do nothing;

insert into nb6_pts
select 'peer_programs', q.c, case when q.q = 0 then 1 else 0 end,
       case q.q when 0 then 'A Richmond youth employment nonprofit adopted the employer intake chapter. A Hayward program starts next month.' end,
       'remi'
from pg_temp.nb6_quarters(16) q
on conflict do nothing;

insert into public.metric_snapshots (id, org_id, metric_id, captured_on, value, captured_by, note, created_at)
select pg_temp.nb_id('msnap:' || p.metric_key || ':' || p.captured_on),
       pg_temp.nb_org(), pg_temp.nb_id('metric:' || p.metric_key), p.captured_on, p.value,
       case when p.by_handle is null then null else pg_temp.nb_user(p.by_handle) end,
       p.note,
       case when p.by_handle is null then pg_temp.nb6_at(p.captured_on, '05:05')
            else pg_temp.nb6_at(p.captured_on, '16:10') end
from nb6_pts p
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Strategic plan "Northbridge <fy+1>" — foundation
-- ════════════════════════════════════════════════════════════════════════════
insert into public.plan_foundation (org_id, mission, vision, values, behaviors, proof_points, created_at, updated_at)
values (
  pg_temp.nb_org(),
  'Northbridge connects Oakland youth ages 14–24 to the people, skills, and paid opportunities that launch careers.',
  'Every young person in Oakland and San Leandro has a real path to a career that pays, and a network of adults who will take their call.',
  '["Youth voice first", "Show up, every week", "Paid work is respect", "Measure what matters", "Partners, not programs"]'::jsonb,
  '["Call families back within one business day", "Pay interns on time, every Friday", "Bring the data to every decision", "Celebrate wins out loud", "Leave every partner better than we found them"]'::jsonb,
  '[{"value": "750+", "label": "Oakland youth served each year"},
    {"value": "78%", "label": "of Cohort 6 fellows employed within 90 days"},
    {"value": "$24.50/hr", "label": "average starting wage for placed graduates"},
    {"value": "85", "label": "paid Summer Works interns last summer"},
    {"value": "86%", "label": "attendance across Launchpad sites"}]'::jsonb,
  pg_temp.nb6_at(pg_temp.nb6_launch(), '10:00'),
  pg_temp.ts(-28, '17:20'))
on conflict do nothing;

-- ── Objectives ──────────────────────────────────────────────────────────────
insert into public.plan_objectives
  (id, org_id, title, three_year_statement, owner, status, sort_order,
   status_override, status_override_reason, created_at, updated_at)
select pg_temp.nb_id('pobj:' || o.k), pg_temp.nb_org(), o.title, o.stmt, o.owner, o.status, o.so,
       o.ovr, o.ovr_reason, pg_temp.nb6_at(pg_temp.nb6_launch(), '10:05'), pg_temp.ts(o.upd, '16:45')
from (values
  ('reach', 'Reach more young people',
   'By June ' || (pg_temp.fy() + 1) || ', Northbridge serves 1,000 Oakland and San Leandro youth a year across four Launchpad sites, with attendance at 85% or better everywhere.',
   'Miguel Arreola', 'on_track', 1, 'on_track',
   'Laurel Ridge is the only site under 85%, and the cause is the new bell schedule, not engagement. The later start and snack table began two weeks ago; the network as a whole is at 86%. Revisit at the next review.',
   -9),
  ('careers', 'Launch careers',
   'By June ' || (pg_temp.fy() + 1) || ', 80% of Pathways graduates are working within 90 days at $25 an hour or more, and 100 young people a year finish a paid Summer Works internship.',
   'Andre Mitchell', 'on_track', 2, null::text, null::text, -28),
  ('durable', 'Build a durable organization',
   'Six months of operating reserves, no single funder above 15% of revenue, and a team that stays, with staff retention at 85% or better.',
   'Tasha Greene', 'at_risk', 3, null, null, -12),
  ('field', 'Lead the field',
   'Three Bay Area youth employment programs run on the Northbridge employer playbook, and the Eastshore workforce board funds the model citywide.',
   'Remi Sobomehin', 'on_track', 4, null, null, -20)
) as o(k, title, stmt, owner, status, so, ovr, ovr_reason, upd)
on conflict do nothing;

-- ── Goals ───────────────────────────────────────────────────────────────────
insert into public.plan_goals
  (id, org_id, objective_id, title, description, target_date, owner, status, sort_order, created_at, updated_at)
select pg_temp.nb_id('pgoal:' || g.k), pg_temp.nb_org(), pg_temp.nb_id('pobj:' || g.obj), g.title, g.descr,
       g.tdate, g.owner, g.status, g.so, pg_temp.nb6_at(g.created, '10:10'), pg_temp.ts(g.upd, '16:50')
from (values
  ('sanleandro', 'reach', 'Open a fourth Launchpad site in San Leandro',
   'Two cohorts of 40 at San Leandro High, starting next school year. Depends on the Meridian decision; one cohort if it does not land.',
   pg_temp.sy_start() + 364, 'Miguel Arreola', 'on_track', 1, pg_temp.fy_start() - 20, -6),
  ('attendance', 'reach', 'Hold Launchpad attendance at 85% or better at every site',
   'Attendance is the leading indicator for everything else we measure. Each site reviews its roster every Friday.',
   pg_temp.sy_start() + 290, 'Rosa Delgado', 'at_risk', 2, pg_temp.nb6_launch(), -9),
  ('youth_served', 'reach', 'Serve 800 young people this fiscal year',
   'Unduplicated across Launchpad, Summer Works, Pathways, and Mentor Circles.',
   make_date(pg_temp.fy(), 6, 30), 'Miguel Arreola', 'on_track', 3, pg_temp.fy_start() - 20, -12),
  ('placement', 'careers', 'Place 80% of Pathways graduates in jobs within 90 days',
   'Jobs of 20+ hours a week, tracked by phone at 30, 60, and 90 days. Wage and credential targets ride with it.',
   make_date(pg_temp.fy() + 1, 6, 30), 'Andre Mitchell', 'on_track', 1, pg_temp.nb6_launch(), -14),
  ('summerworks', 'careers', 'Grow Summer Works to 100 paid interns',
   'Thirty employers hosting 100 interns next summer, with the stipend fund fully raised by April.',
   pg_temp.summer_start() + 364 + 46, 'Simone Baptiste', 'on_track', 2, pg_temp.nb6_launch(), -12),
  ('mentors', 'careers', 'Match 60 young people with a mentor',
   'Every Pathways fellow and every Mentor Circles youth who asks gets a trained mentor within a month.',
   make_date(pg_temp.fy(), 6, 30), 'Simone Baptiste', 'on_track', 3, pg_temp.nb6_launch(), -20),
  ('reserves', 'durable', 'Build reserves to six months of operating expenses',
   'The board''s reserve policy: six months of operating expense in cash, with the Opportunity Reserve as the backstop.',
   make_date(pg_temp.fy(), 6, 30), 'Kwame Asante', 'at_risk', 1, pg_temp.nb6_launch(), -12),
  ('floor', 'durable', 'Raise the FY' || pg_temp.fy() || ' budget: $3.4M floor, $3.55M goal',
   'The floor covers the operating budget; the goal adds the $150K surplus that builds the reserve.',
   make_date(pg_temp.fy(), 6, 30), 'Priya Natarajan', 'on_track', 2, pg_temp.fy_start() - 20, -1),
  ('diversify', 'durable', 'Diversify revenue so no funder is more than 15%',
   'More monthly donors, more employer partners paying in, and donors who give again next year.',
   make_date(pg_temp.fy() + 1, 6, 30), 'Priya Natarajan', 'on_track', 3, pg_temp.nb6_launch(), -9),
  ('team', 'durable', 'Keep the team: 85% staff retention',
   'Benchmarked pay, real growth plans, and managers trained to coach.',
   make_date(pg_temp.fy(), 6, 30), 'Tasha Greene', 'on_track', 4, pg_temp.nb6_launch(), -30),
  ('playbook', 'field', 'Share the employer playbook with three peer programs',
   'Write down how we recruit, prepare, and keep employer partners, and train other programs to run it.',
   make_date(pg_temp.fy(), 6, 30), 'Remi Sobomehin', 'on_track', 1, pg_temp.nb6_launch(), -20),
  ('policy', 'field', 'Make the case for citywide public funding of youth employment',
   'Turn the Eastshore contract and the state award into a multi-year public commitment.',
   make_date(pg_temp.fy() + 1, 6, 30), 'Remi Sobomehin', 'on_track', 2, pg_temp.nb6_launch(), -45)
) as g(k, obj, title, descr, tdate, owner, status, so, created, upd)
on conflict do nothing;

-- ── Initiatives (keys init:<k>; Section 8a attaches ops_projects by key) ────
insert into public.plan_initiatives
  (id, org_id, goal_id, title, owner, status, sort_order, description, created_at, updated_at)
select pg_temp.nb_id('init:' || i.k), pg_temp.nb_org(), pg_temp.nb_id('pgoal:' || i.goal), i.title, i.owner, i.status, i.so,
       i.descr, pg_temp.ts(i.created, '10:30'), pg_temp.ts(i.upd, '15:40')
from (values
  -- San Leandro
  ('sl_mou',       'sanleandro', 'Sign the site MOU with San Leandro Unified', 'Miguel Arreola', 'in_progress', 1,
   'Draft is with district counsel; data-sharing terms match our Eastlake agreement.', -88, -6),
  ('sl_meridian',  'sanleandro', 'Win the Meridian grant that funds the San Leandro launch', 'Remi Sobomehin / Priya Natarajan', 'in_progress', 2,
   '$300K over two years. Proposal submitted; decision expected in about five weeks.', -88, -21),
  ('sl_launch',    'sanleandro', 'Build the San Leandro launch plan and family outreach', 'Rosa Delgado', 'in_progress', 3,
   'Site walk done, principal signed off. Family information nights planned for spring.', -80, -8),
  ('sl_hire',      'sanleandro', 'Hire a San Leandro site coordinator', 'Tasha Greene', 'todo', 4,
   'Post the role once the MOU is signed.', -80, -80),
  -- Attendance
  ('att_texts',    'attendance', 'Weekly attendance texts to families', 'Rosa Delgado', 'done', 1,
   'Every Friday, each family gets the week''s attendance by text. Running at all three sites.', -400, -300),
  ('att_laurel',   'attendance', 'Laurel Ridge schedule fix: later start and a snack table', 'Rosa Delgado', 'in_progress', 2,
   'Moved start to 3:45 to match the new bell schedule and added a snack table.', -30, -14),
  ('att_alert',    'attendance', 'Check in with families after two missed sessions', 'Rosa Delgado', 'in_progress', 3,
   'Early-alert call within 48 hours of a second absence.', -60, -2),
  -- Youth served
  ('ys_freshman',  'youth_served', 'Freshman recruitment week at all three high schools', 'Simone Baptiste', 'done', 1,
   '142 sign-ups across Eastlake, Laurel Ridge, and Bayshore.', -75, -45),
  ('ys_cohort8',   'youth_served', 'Recruit and select Pathways Cohort 8 (36 fellows)', 'Andre Mitchell', 'in_progress', 2,
   'About 40 applications in; interviews start next week.', -45, -3),
  -- Placement
  ('pl_hiring',    'placement', 'Line up 20 employer hiring commitments for Cohort 7', 'Andre Mitchell', 'in_progress', 1,
   '13 of 20 commitments signed, led by Kinetic Labs and Harbor Health.', -70, -10),
  ('pl_followup',  'placement', '90-day follow-up with every Cohort 6 graduate', 'Ben Okoro', 'done', 2,
   'Reached 32 of 32 graduates at 30, 60, and 90 days.', -120, -36),
  ('pl_cna',       'placement', 'CNA exam prep for the healthcare track', 'Andre Mitchell', 'in_progress', 3,
   'Twelve healthcare fellows; first exam date in about a month.', -60, -10),
  ('pl_harbor',    'placement', 'Add clinical placements with Harbor Health Partners', 'Andre Mitchell', 'done', 4,
   'Ten clinical placement slots a year, confirmed in writing.', -300, -150),
  -- Summer Works
  ('sw_employers', 'summerworks', 'Recruit 30 employers for next summer', 'Simone Baptiste', 'in_progress', 1,
   '19 returning employers have said yes; 11 more to find.', -25, -5),
  ('sw_sponsor',   'summerworks', 'Renew Pacific Summit Bank as presenting sponsor', 'Priya Natarajan', 'in_progress', 2,
   'Daniel Osei is championing a $60K renewal.', -20, -12),
  ('sw_payroll',   'summerworks', 'Move intern payroll to a payroll provider', 'Kwame Asante', 'done', 3,
   'Every intern paid on time all seven weeks this summer.', -200, -110),
  -- Mentors
  ('mc_kinetic',   'mentors', 'Launch the Kinetic Labs employee mentor group', 'Simone Baptiste', 'done', 1,
   'Twelve Kinetic Labs engineers trained and matched.', -180, -60),
  ('mc_training',  'mentors', 'Quarterly mentor training and background checks', 'Simone Baptiste', 'in_progress', 2,
   'Next training cohort of 14 mentors in three weeks.', -150, -20),
  -- Reserves
  ('rs_policy',    'reserves', 'Board-approved operating reserve policy', 'Kwame Asante', 'done', 1,
   'Adopted by the board: six months of operating expense, reviewed every June.', -330, -110),
  ('rs_surplus',   'reserves', 'Budget a $150K surplus into the Opportunity Reserve', 'Kwame Asante', 'in_progress', 2,
   'Built into the FY budget; transfers happen at each quarter close.', -110, -12),
  ('rs_audit',     'reserves', 'Close the FY' || (pg_temp.fy() - 1) || ' audit with no findings', 'Kwame Asante', 'in_progress', 3,
   'Fieldwork underway; PBC list due to the auditors this week.', -60, -4),
  -- Floor
  ('fl_yearend',   'floor', 'Launch the Year-End ' || extract(year from pg_temp.d(60))::int || ' campaign ($400K goal)', 'Priya Natarajan', 'in_progress', 1,
   'Letter, email series, and a matching gift from the board. Launches in two weeks.', -40, -2),
  ('fl_major',     'floor', 'Major gift portfolio: 12 asks of $25K or more', 'Remi Sobomehin', 'in_progress', 2,
   'Five asks made, two closed. Wu and Okafor are next.', -100, -4),
  ('fl_grants',    'floor', 'Grant calendar: every report and renewal on time', 'Lena Park', 'in_progress', 3,
   'Hollis interim and Bayview annual reports are the next two deadlines.', -100, -3),
  -- Diversify
  ('dv_monthly',   'diversify', 'Grow the monthly giving circle to 60 members', 'Jordan Ellis', 'in_progress', 1,
   'GivingTuesday ask and an upgrade path from one-time donors.', -150, -7),
  ('dv_crm',       'diversify', 'Clean up donor data so retention numbers hold up', 'Ben Okoro', 'in_progress', 2,
   'Duplicates merged; household links and lapsed dates next.', -50, -5),
  ('dv_earned',    'diversify', 'Pilot paid employer training services', 'Remi Sobomehin', 'todo', 3,
   'Fee-for-service onboarding for employers who hire our graduates. Ravi Patel is advising.', -60, -60),
  -- Team
  ('tm_bands',     'team', 'Benchmark salary bands to Bay Area nonprofits', 'Tasha Greene', 'done', 1,
   'New bands took effect July 1.', -260, -110),
  ('tm_reviews',   'team', 'Mid-year reviews and growth plans for every staff member', 'Tasha Greene', 'in_progress', 2,
   'Self-reviews are in; manager conversations this month.', -30, -6),
  -- Playbook
  ('pb_write',     'playbook', 'Write the Northbridge employer playbook', 'Remi Sobomehin', 'in_progress', 1,
   'Chapters 1–3 drafted: recruiting employers, preparing interns, keeping partners.', -120, -20),
  ('pb_peers',     'playbook', 'Train two more peer programs on the playbook', 'Miguel Arreola', 'todo', 2,
   'Hayward program starts next month.', -60, -60),
  ('pb_retreat',   'playbook', 'Board retreat: adopt the lead-the-field strategy', 'Remi Sobomehin', 'todo', 3,
   'On the annual retreat agenda.', -30, -15),
  -- Policy
  ('po_eastshore', 'policy', 'Brief the Eastshore workforce board on Cohort 6 outcomes', 'Remi Sobomehin', 'done', 1,
   'Presented the 90-day placement data to the full board.', -60, -22),
  ('po_state',     'policy', 'Renew the California Youth Opportunity award at a higher level', 'Lena Park', 'todo', 2,
   'Renewal window opens in the spring.', -90, -90)
) as i(k, goal, title, owner, status, so, descr, created, upd)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. KPIs (measures). Linked ones carry metric_id; auto ones use PLAN_METRICS.
-- ════════════════════════════════════════════════════════════════════════════
-- v.cur: a literal current value (null → the linked metric's latest point).
-- v.upd: days-ago of the last manual update (null → the metric's latest point).
insert into public.plan_kpis
  (id, org_id, goal_id, title, unit, target, current, owner, cadence, source, metric_key, status,
   last_updated_at, created_at, updated_at, baseline, baseline_date, metric_id, notes)
select pg_temp.nb_id('kpi:' || v.k), pg_temp.nb_org(), pg_temp.nb_id('pgoal:' || v.goal), v.title, v.unit,
       v.target, cur.value, v.owner, v.cadence, v.source, v.mkey,
       case when v.source = 'auto' then pg_temp.nb6_kpihealth(cur.value, v.target) else v.status end,
       upd.ts, pg_temp.nb6_at(pg_temp.nb6_launch(), '10:20') + make_interval(mins => v.n), upd.ts,
       v.baseline, v.bdate,
       case when v.mdef is null then null else pg_temp.nb_id('metric:' || v.mdef) end,
       v.notes
from (values
  -- Reach
  (1, 'sl_milestones', 'sanleandro', 'San Leandro launch milestones complete', 'milestones', 6::numeric, 3::numeric, 0::numeric, pg_temp.d(-110),
   'Miguel Arreola', 'monthly', 'manual', null::text, null::text, 'on_track', -6,
   'Done: site walk, principal sign-off, launch budget. Open: MOU, coordinator hire, family nights.'),
  (2, 'attendance', 'attendance', 'Launchpad attendance, all sites', '%', 85, round(pg_temp.nb6_v('now_att')), 81, make_date(pg_temp.fy() - 2, 5, 31),
   'Rosa Delgado', 'monthly', 'manual', null, null, 'on_track', -9,
   'Eastlake 89%, Bayshore 88%, Laurel Ridge 79%.'),
  (3, 'att_laurel', 'attendance', 'Laurel Ridge attendance', '%', 85, 79, 88, make_date(pg_temp.fy() - 1, 5, 31),
   'Rosa Delgado', 'monthly', 'manual', null, null, 'at_risk', -9,
   'Dipped after the bell schedule moved dismissal to 3:30. Later start and snack table began two weeks ago.'),
  (4, 'youth_served', 'youth_served', 'Youth served this fiscal year', 'youth', 800, null, 742, make_date(pg_temp.fy() - 1, 6, 30),
   'Ben Okoro', 'monthly', 'manual', null, 'youth_served', 'on_track', null,
   'Ahead of last year''s pace (742 for the full year).'),
  (5, 'active', 'youth_served', 'Participants actively enrolled', 'youth', pg_temp.nb6_v('t_active'), null, 195, pg_temp.d(-490),
   'Miguel Arreola', 'weekly', 'auto', 'active_teens', 'active_participants', null, 0, null),
  -- Careers
  (6, 'placement', 'placement', 'Pathways graduates employed at 90 days', '%', 80, null, 71, pg_temp.summer_start() - 2 - 364 + 90,
   'Andre Mitchell', 'monthly', 'manual', null, 'placement_rate', 'on_track', null,
   'Cohort 6: 25 of 32 graduates. Two more have offers pending.'),
  (7, 'wage', 'placement', 'Average starting wage ($/hr)', '$', 25, null, 22.8, pg_temp.summer_start() - 2 - 364 + 90,
   'Andre Mitchell', 'monthly', 'manual', null, 'avg_starting_wage', 'on_track', null, null),
  (8, 'credentials', 'placement', 'Industry credentials earned (last 12 months)', 'credentials', 65, null, 41, pg_temp.d(-485),
   'Andre Mitchell', 'monthly', 'manual', null, 'credentials_earned', 'on_track', null, null),
  (9, 'interns', 'summerworks', 'Summer Works paid interns', 'interns', 100, null, 72, pg_temp.summer_start() - 364 + 50,
   'Simone Baptiste', 'quarterly', 'manual', null, 'summer_interns', 'on_track', null,
   'Next count after next summer. Stipend fund is the constraint, not employer demand.'),
  (10, 'employers', 'summerworks', 'Active employer partners', 'employers', 30, null, 18, pg_temp.d(-485),
   'Simone Baptiste', 'monthly', 'manual', null, 'employer_partners', 'on_track', null, null),
  (11, 'mentors', 'mentors', 'Youth matched with a mentor', 'matches', 60, null, 38, pg_temp.d(-485),
   'Simone Baptiste', 'monthly', 'manual', null, 'mentor_matches', 'on_track', null,
   'Nine youth on the waitlist; the next training cohort clears it.'),
  -- Durable
  (12, 'runway', 'reserves', 'Months of operating reserve', 'months', 6, null, 4.6, pg_temp.d(-485),
   'Kwame Asante', 'monthly', 'manual', 'cash_runway_months', 'months_of_runway', 'at_risk', null,
   'Close: $1.55M cash at $280K average monthly expense. On plan to reach six months by June if Meridian and the state award land on schedule.'),
  (13, 'floor', 'floor', 'Gifts received toward the $3.4M floor', '$', 3400000, pg_temp.nb6_v('now_secured'), 0, pg_temp.fy_start(),
   'Priya Natarajan', 'monthly', 'manual', 'dollars_raised_fy26', null, 'on_track', -1,
   'Gifts received this fiscal year. With signed grants, pledges, and the Eastshore contract, about 68% of the FY goal is received or committed.'),
  (14, 'ceiling', 'floor', 'Gifts received toward the $3.55M goal', '$', 3550000, pg_temp.nb6_v('now_secured'), 0, pg_temp.fy_start(),
   'Priya Natarajan', 'monthly', 'manual', 'dollars_ceiling_fy26', null, 'on_track', -1,
   'The goal adds the $150K surplus that builds the reserve.'),
  (15, 'pipeline', 'floor', 'Weighted pipeline', '$', pg_temp.nb6_v('t_pipeline'), null, 380000, pg_temp.d(-490),
   'Priya Natarajan', 'weekly', 'auto', 'weighted_pipeline_fy26', 'weighted_pipeline', null, 0, null),
  (16, 'gifts10k', 'floor', 'Gifts of $10,000 or more this fiscal year', 'gifts', 30, pg_temp.nb6_v('now_10k'), 0, pg_temp.fy_start(),
   'Remi Sobomehin', 'monthly', 'manual', 'gifts_10k_closed', null, 'on_track', -1, null),
  (17, 'fs_foundations', 'floor', 'From foundations', '$', 1250000, 940000, null, null,
   'Lena Park', 'monthly', 'manual', 'floor_source_foundations', null, 'on_track', -12,
   'Received or committed: Bayview, Hollis, and seven smaller foundation grants.'),
  (18, 'fs_government', 'floor', 'From government contracts', '$', 950000, 595000, null, null,
   'Lena Park', 'monthly', 'manual', 'floor_source_government', null, 'on_track', -12,
   'Eastshore Workforce Development Board contract and the California Youth Opportunity award.'),
  (19, 'fs_corporate', 'floor', 'From corporate and employer partners', '$', 450000, 340000, null, null,
   'Priya Natarajan', 'monthly', 'manual', 'floor_source_corporate', null, 'on_track', -12,
   'Kinetic Labs pledge, Harbor Health, Redline Builders, and Summer Works sponsorships.'),
  (20, 'fs_individual', 'floor', 'From individuals and major gifts', '$', 750000, 540000, null, null,
   'Priya Natarajan', 'monthly', 'manual', 'floor_source_individual', null, 'on_track', -12,
   'Board giving, the Chen pledge, monthly donors, and year-end commitments.'),
  (21, 'corporate', 'diversify', 'Corporate and employer giving received', '$', 450000, pg_temp.nb6_v('now_corp'), 0, pg_temp.fy_start(),
   'Priya Natarajan', 'monthly', 'manual', 'corporate_raised', null, 'on_track', -1, null),
  (22, 'monthly', 'diversify', 'Monthly giving circle members', 'donors', pg_temp.nb6_v('t_donors'), null, 31, pg_temp.d(-490),
   'Jordan Ellis', 'weekly', 'auto', 'monthly_donors', 'monthly_donors', null, 0, null),
  (23, 'retention', 'diversify', 'Donor retention rate', '%', 70, null, 58, make_date(pg_temp.fy() - 2, 6, 30),
   'Priya Natarajan', 'quarterly', 'manual', null, 'donor_retention', 'on_track', null,
   'Provisional until the donor data cleanup finishes.'),
  (24, 'staff_retention', 'team', 'Staff retention (last 12 months)', '%', 85, null, 82, make_date(pg_temp.fy() - 2, 6, 30),
   'Tasha Greene', 'quarterly', 'manual', null, 'staff_retention', 'on_track', null, null),
  -- Field
  (25, 'peers', 'playbook', 'Peer programs using the playbook', 'programs', 3, null, 0, make_date(pg_temp.fy() - 1, 6, 30),
   'Remi Sobomehin', 'quarterly', 'manual', null, 'peer_programs', 'on_track', null, null),
  (26, 'public', 'policy', 'Public funding for youth employment', '$', 800000, 595000, 420000, make_date(pg_temp.fy() - 1, 6, 30),
   'Remi Sobomehin', 'quarterly', 'manual', null, null, 'on_track', -22,
   'Eastshore contract ($420K) plus the state award ($175K).')
) as v(n, k, goal, title, unit, target, cur, baseline, bdate, owner, cadence, source, mkey, mdef, status, upd, notes)
cross join lateral (
  select coalesce(v.cur, (select p.value from nb6_pts p where p.metric_key = v.mdef order by p.captured_on desc limit 1)) as value
) cur
cross join lateral (
  select case
           when v.upd is not null and v.source = 'auto' then pg_temp.ts(v.upd, '05:05')
           when v.upd is not null then pg_temp.ts(v.upd, '16:30')
           else pg_temp.nb6_at((select max(p.captured_on) from nb6_pts p where p.metric_key = v.mdef), '16:10')
         end as ts
) upd
on conflict do nothing;

-- KPI snapshots: linked KPIs mirror their metric's history (the app writes both
-- sides in lockstep); unlinked ones get their own monthly series.
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:' || l.kpi), p.captured_on, p.value, pg_temp.nb6_at(p.captured_on, '16:15')
from (values
  ('youth_served', 'youth_served'), ('active', 'active_participants'), ('placement', 'placement_rate'),
  ('wage', 'avg_starting_wage'), ('credentials', 'credentials_earned'), ('interns', 'summer_interns'),
  ('employers', 'employer_partners'), ('mentors', 'mentor_matches'), ('runway', 'months_of_runway'),
  ('pipeline', 'weighted_pipeline'), ('monthly', 'monthly_donors'), ('retention', 'donor_retention'),
  ('staff_retention', 'staff_retention'), ('peers', 'peer_programs')
) as l(kpi, metric)
join nb6_pts p on p.metric_key = l.metric
on conflict do nothing;

-- Attendance (hand-entered monthly at the review, from the same marks).
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:attendance'), x.c, round(x.value), pg_temp.nb6_at(x.c, '16:15')
from (
  select distinct on (date_trunc('month', p.captured_on)) p.captured_on as c, p.value
  from nb6_pts p where p.metric_key = 'attendance_rate' and p.captured_on < pg_temp.d(0)
  order by date_trunc('month', p.captured_on), p.captured_on desc
) x
on conflict do nothing;
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:attendance'), pg_temp.d(-9), round(pg_temp.nb6_v('now_att')), pg_temp.ts(-9, '16:15')
on conflict do nothing;

-- Laurel Ridge and the San Leandro milestones, month by month.
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:' || s.kpi), s.c, s.v, pg_temp.nb6_at(s.c, '16:15')
from (
  select 'att_laurel' as kpi, g.c, (array[79, 84, 89, null, 87, 88, 89, 88, 86, 87]::numeric[])[g.k + 1] as v
  from pg_temp.nb6_months(9) g where g.k <= 9
  union all
  select 'sl_milestones', g.c, (array[3, 2, 1, 1, 0]::numeric[])[g.k + 1]
  from pg_temp.nb6_months(6) g where g.k <= 4
) s
where s.v is not null
on conflict do nothing;

-- Money KPIs: month-end values this fiscal year + yesterday's update.
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:' || k.kpi), d.c,
       case when d.c = pg_temp.d(-1) then k.now
            when coalesce(pg_temp.nb6_v('gift_rows'), 0) >= 50 then
              (select coalesce(case k.kind when 'sum' then sum(gf.amount)
                                           when 'count10k' then count(*) filter (where gf.amount >= 10000)
                                           when 'corp' then sum(gf.amount) filter (where c.type = 'organization') end, 0)
                 from public.gifts gf left join public.constituents c on c.id = gf.constituent_id
                where gf.org_id = pg_temp.nb_org() and gf.gift_date between pg_temp.fy_start() and d.c)
            else round(k.now * pg_temp.nb6_story_gifts(d.c) / nullif(pg_temp.nb6_story_gifts(pg_temp.d(0)), 0),
                       case when k.kind = 'count10k' then 0 else -2 end)
       end,
       pg_temp.nb6_at(d.c, '16:30')
from (values
  ('floor', 'sum', pg_temp.nb6_v('now_secured')),
  ('ceiling', 'sum', pg_temp.nb6_v('now_secured')),
  ('gifts10k', 'count10k', pg_temp.nb6_v('now_10k')),
  ('corporate', 'corp', pg_temp.nb6_v('now_corp'))
) as k(kpi, kind, now)
cross join (
  select (pg_temp.mon(-m) - 1) as c from generate_series(0, 11) m
  where pg_temp.mon(-m) - 1 >= pg_temp.fy_start() and pg_temp.mon(-m) - 1 < pg_temp.d(-1)
  union select pg_temp.d(-1)
) d
on conflict do nothing;

-- Floor sources: committed dollars by channel since July 1 (multi-year awards
-- carry in on day one).
insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:' || f.kpi), d.c,
       round(f.now * (f.carry + (1 - f.carry) * greatest(0, (d.c - pg_temp.fy_start()))::numeric
                      / greatest(1, (pg_temp.d(-12) - pg_temp.fy_start()))), -3),
       pg_temp.nb6_at(d.c, '16:30')
from (values
  ('fs_foundations', 940000::numeric, 0.55::numeric),
  ('fs_government', 595000, 0.70),
  ('fs_corporate', 340000, 0.40),
  ('fs_individual', 540000, 0.35)
) as f(kpi, now, carry)
cross join (
  select (pg_temp.mon(-m) - 1) as c from generate_series(0, 11) m
  where pg_temp.mon(-m) - 1 >= pg_temp.fy_start() and pg_temp.mon(-m) - 1 < pg_temp.d(-12)
  union select pg_temp.d(-12)
) d
on conflict do nothing;

insert into public.plan_kpi_snapshots (org_id, kpi_id, captured_on, value, created_at)
select pg_temp.nb_org(), pg_temp.nb_id('kpi:public'), q.c, case when q.q <= 1 then 595000 else 420000 end, pg_temp.nb6_at(q.c, '16:30')
from pg_temp.nb6_quarters(22) q
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Reviews, objective notes, objective tasks
-- ════════════════════════════════════════════════════════════════════════════
-- conducted_by is the reviewer's email, as the app writes it (ctx.email).
insert into public.plan_reviews (id, org_id, conducted_at, conducted_by, notes, next_review_at, created_at, updated_at)
select pg_temp.nb_id('preview:' || r.k), pg_temp.nb_org(), pg_temp.ts(r.days, r.hhmi), r.who, r.notes,
       pg_temp.d(r.next_days), pg_temp.ts(r.days, r.hhmi), pg_temp.ts(r.days, r.hhmi)
from (values
  ('m6', -182, '16:00', pg_temp.nb_remi_email(),
   'Monthly check-in. Gala in three weeks with 18 of 24 tables sold. Cohort 6 on track to graduate 32 of 34. Laurel Ridge MOU renewed. Runway 4.9 months; Kwame is drafting the reserve policy for the next board meeting.',
   -154),
  ('m5', -154, '16:00', pg_temp.nb_remi_email(),
   'Monthly check-in. The gala raised $285K gross, above its $275K goal. Summer Works: 22 employers confirmed, 85 interns offered. Reserve policy goes to the board next month. Agreed to hold the San Leandro decision until the new fiscal year.',
   -126),
  ('m4', -126, '15:30', pg_temp.nb_remi_email(),
   'Year-end review. On pace to finish near 740 youth served (target 720). Cohort 5 placement held at 71%. Reserve policy adopted: six months by next June. Carry-forward: San Leandro, the employer playbook, donor data cleanup.',
   -90),
  ('q1', -90, '14:00', pg_temp.nb_remi_email(),
   'Quarterly plan review with the leadership team. Set FY' || pg_temp.fy() || ' targets: 800 youth served, 80% placement at 90 days, six months of reserves by June, $3.4M floor and $3.55M goal. Decided to pursue Meridian for San Leandro rather than wait a year; Lena owns the proposal. Runway 5.2 months. Added "Lead the field" goals for the playbook and public funding.',
   -62),
  ('m2', -62, '16:00', pg_temp.nb_remi_email(),
   'Monthly check-in. Summer Works closed: 85 interns, 22 employers, every payroll on time. Launchpad opened at all three sites. Meridian draft on schedule. No target changes.',
   -28),
  ('m1', -28, '16:00', 'tasha@northbridge.example',
   'Monthly check-in (Tasha facilitating; Remi at the Eastshore board). Laurel Ridge attendance dipped to 79% after the bell-schedule change; Rosa has a fix in place. Cohort 6 reached its 90-day mark at 78% placed, two points under target. Runway 5.4 months after the Bayview payment. Meridian submitted. Next: quarterly review with the board strategy committee.',
   8)
) as r(k, days, hhmi, who, notes, next_days)
on conflict do nothing;

-- author = the writer's email local part, as the notes route stores it.
insert into public.plan_objective_notes (id, org_id, objective_id, body, author, created_at, updated_at)
select pg_temp.nb_id('pnote:' || n.k), pg_temp.nb_org(), pg_temp.nb_id('pobj:' || n.obj), n.body, n.author,
       pg_temp.ts(n.days, n.hhmi), pg_temp.ts(n.days, n.hhmi)
from (values
  ('reach_1', 'reach', 'miguel', -34, '17:10',
   'Laurel Ridge dropped to 79% after the bell schedule moved dismissal. Rosa and Mr. Whitaker agreed on a 3:45 start and a snack table. We will know by the next review whether it holds.'),
  ('reach_2', 'reach', 'remi', -6, '18:40',
   'San Leandro is ready on our side. The MOU draft is with district counsel and the launch budget is built. Opening with two cohorts depends on the Meridian decision; if it does not land, we open with one.'),
  ('careers_1', 'careers', 'andre', -27, '16:20',
   'Cohort 6 at 90 days: 25 of 32 graduates working, average $24.50 an hour, up from $22.80 for Cohort 5. Amara Johnson is at Kinetic Labs at $28. Two more fellows have offers pending, which would put us at 84%.'),
  ('careers_2', 'careers', 'simone', -12, '15:05',
   'Summer Works closed at 85 interns with 22 employers. Nineteen employers have already said yes for next summer. The other eleven start with the Pacific Summit renewal conversation.'),
  ('durable_1', 'durable', 'kwame', -15, '11:30',
   'Last month''s close: $1.55M cash, $280K average monthly expense, 5.5 months. The budgeted $150K surplus gets us to six months by June, as long as the Meridian and state money arrive on schedule.'),
  ('durable_2', 'durable', 'priya', 0, '07:40',
   'Year-End launches in two weeks with a $400K goal. The largest open asks are Meridian ($300K), Wu ($100K), and Sequoia ($100K, intro meeting this week). Okafor has not renewed yet; Remi is calling him today.'),
  ('field_1', 'field', 'remi', -20, '19:15',
   'After the Eastshore briefing, programs in Richmond and Hayward asked for the playbook. Richmond adopted the employer intake chapter. Chapters 1–3 are drafted; the Program committee sees them next month.')
) as n(k, obj, author, days, hhmi, body)
on conflict do nothing;

insert into public.plan_objective_tasks (id, org_id, objective_id, title, assignee, status, due_date, sort_order, created_at, updated_at)
select pg_temp.nb_id('ptask:' || t.k), pg_temp.nb_org(), pg_temp.nb_id('pobj:' || t.obj), t.title, t.who, t.status,
       pg_temp.d(t.due), t.so, pg_temp.ts(t.created, '16:30'), pg_temp.ts(t.upd, '16:30')
from (values
  ('reach_1',   'reach',   'Report Laurel Ridge attendance after four weeks on the new schedule', 'Rosa Delgado', 'todo', 9, 1, -28, -28),
  ('reach_2',   'reach',   'Send MOU redlines back to San Leandro Unified counsel', 'Miguel Arreola', 'todo', 6, 2, -6, -6),
  ('reach_3',   'reach',   'Confirm the 3:45 start with the Laurel Ridge assistant principal', 'Rosa Delgado', 'done', -20, 3, -28, -21),
  ('careers_1', 'careers', 'Book CNA exam seats for the healthcare fellows', 'Andre Mitchell', 'done', -10, 1, -27, -11),
  ('careers_2', 'careers', 'Ask eleven more employers for Summer Works slots', 'Simone Baptiste', 'todo', 30, 2, -12, -12),
  ('careers_3', 'careers', 'Close out the two pending Cohort 6 offers', 'Andre Mitchell', 'todo', 14, 3, -27, -27),
  ('durable_1', 'durable', 'Draft the reserve progress slide for the board packet', 'Kwame Asante', 'todo', 15, 1, -15, -15),
  ('durable_2', 'durable', 'Re-run donor retention after the duplicate merge', 'Ben Okoro', 'todo', 20, 2, -28, -28),
  ('durable_3', 'durable', 'Update the floor-by-source numbers after the Bayview payment', 'Lena Park', 'done', -12, 3, -28, -12),
  ('field_1',   'field',   'Share playbook chapters 1–3 with the Program committee', 'Remi Sobomehin', 'todo', 12, 1, -20, -20),
  ('field_2',   'field',   'Thank-you note to the Eastshore board chair', 'Remi Sobomehin', 'done', -18, 2, -22, -18)
) as t(k, obj, title, who, status, due, so, created, upd)
on conflict do nothing;

-- ── The prior plan, archived when Northbridge <fy+1> launched ───────────────
insert into public.plan_archives (id, org_id, label, note, payload, created_at)
select pg_temp.nb_id('parchive:forward'), pg_temp.nb_org(),
       'northbridge-forward-fy' || (pg_temp.fy() - 4) || '-fy' || (pg_temp.fy() - 2),
       'Northbridge Forward, the FY' || (pg_temp.fy() - 4) || '–FY' || (pg_temp.fy() - 2)
         || ' plan, superseded by Northbridge ' || (pg_temp.fy() + 1) || ' when the board approved it.',
       jsonb_build_object(
         'archived_at_counts', jsonb_build_object('objectives', 3, 'goals', 7, 'initiatives', 14, 'kpis', 9),
         'objectives', jsonb_build_array(
           jsonb_build_object('title', 'Stabilize Launchpad at three school sites', 'status', 'done',
             'three_year_statement', 'Three Launchpad sites with signed MOUs and 80% attendance.'),
           jsonb_build_object('title', 'Launch the Pathways Fellowship', 'status', 'done',
             'three_year_statement', 'Two graduating cohorts with 70% placement at 90 days.'),
           jsonb_build_object('title', 'Strengthen the back office', 'status', 'done',
             'three_year_statement', 'Clean audits, a real finance function, and four months of reserves.')),
         'goals', jsonb_build_array(
           jsonb_build_object('title', 'Open the Bayshore Academy site', 'status', 'done'),
           jsonb_build_object('title', 'Hold Launchpad attendance at 80%', 'status', 'done'),
           jsonb_build_object('title', 'Graduate Pathways Cohorts 4 and 5', 'status', 'done'),
           jsonb_build_object('title', 'Reach 70% placement at 90 days', 'status', 'done'),
           jsonb_build_object('title', 'Grow Summer Works to 75 interns', 'status', 'behind'),
           jsonb_build_object('title', 'Two clean audits in a row', 'status', 'done'),
           jsonb_build_object('title', 'Four months of operating reserves', 'status', 'done')),
         'kpis', jsonb_build_array(
           jsonb_build_object('title', 'Youth served per year', 'baseline', 480, 'target', 700, 'final', 690),
           jsonb_build_object('title', 'Launchpad attendance', 'unit', '%', 'baseline', 74, 'target', 80, 'final', 82),
           jsonb_build_object('title', 'Placement at 90 days', 'unit', '%', 'baseline', 58, 'target', 70, 'final', 71),
           jsonb_build_object('title', 'Summer Works interns', 'baseline', 40, 'target', 75, 'final', 64),
           jsonb_build_object('title', 'Months of operating reserve', 'unit', 'months', 'baseline', 2.1, 'target', 4, 'final', 4.4))),
       pg_temp.nb6_at(pg_temp.nb6_launch() + 2, '09:30')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Strategy angles (the 8 funding doors) + Strategy Room meta.
--    One table serves the Narrative's "How We Raise It", the readiness
--    linter, and Fundraising → Strategy. Section 3b maps funders onto these
--    keys in funder_angles; it should not create parallel angles.
-- ════════════════════════════════════════════════════════════════════════════
insert into public.strategy_angles
  (id, org_id, key, name, nav_title, status_badge, tone, hook, frame, lead, funds_label, funds, want,
   catch_label, catch_body, ask, flag, approach, sort_order, is_active, created_at, updated_at)
select pg_temp.nb_id('angle:' || a.k), pg_temp.nb_org(), a.k, a.name, a.nav, a.badge, a.tone, a.hook, a.frame, a.lead,
       'Who funds this', a.funds, a.want, case when a.catch_body is null then null else 'The catch' end, a.catch_body,
       a.ask, a.flag, a.approach, a.so, true,
       pg_temp.nb6_at(pg_temp.nb6_launch() + 30, '11:00'), pg_temp.ts(a.upd, '14:00')
from (values
  ('talent-pipeline', 'Oakland''s Talent Pipeline', 'Talent Pipeline', 'north-star', 'primary',
   'We connect Oakland youth to paid work, credentials, and the people who open doors, and we can show where every graduate is 90 days later.',
   'Oakland employers say they cannot find local talent. Oakland young people say nobody calls them back. Northbridge sits between the two: we recruit, prepare, and place young people, and we stay with them until the job sticks.',
   'The point is not one great internship. The point is a city where a kid from East Oakland has the same shot at a career as anyone.',
   'Community foundations, family foundations with economic mobility portfolios, and regional banks'' community investment arms.',
   'Placement and wage data at 90 days, a credible cost per placement, and a plan that grows without breaking.',
   'Most of these funders give general operating support only to organizations they already know. The intro matters more than the proposal.',
   '$150K–$300K a year, multi-year, general operating.', null::text,
   'Lead with Amara''s story and the Cohort 6 90-day numbers. Remi takes first meetings; Lena follows with the proposal.', 1, -21),
  ('first-paycheck', 'The First Paycheck', 'First Paycheck', 'proven', 'primary',
   'Eighty-five teens earned a real paycheck last summer at 22 employers. A first job at 16 changes what a young person believes is possible.',
   'Summer Works pays young people for seven weeks of real work, every Friday, on time. Employers host and mentor; we recruit, prepare, and handle payroll.',
   'A paycheck is the first proof that someone is counting on you.',
   'Bank and corporate foundations, workforce funders, and employers who host interns.',
   'Number of paid interns, hours worked, completion, and what interns do the next summer.',
   null, '$2,500 pays one intern''s seven-week wage. $50K presents the summer.', null,
   'Corporate sponsors renew when their own interns speak at the close-out. Book the bank''s team early.', 2, -12),
  ('healthcare-workforce', 'Healthcare Workforce from the Neighborhood', 'Healthcare Workforce', 'building', 'soft',
   'Our healthcare track trains East and West Oakland young adults as nursing assistants and medical assistants for the hospitals that need local hires.',
   'Hospitals and clinics in the East Bay are short on entry-level clinical staff who reflect the neighborhoods they serve. Pathways fellows earn their CNA or MA certificate, rotate through Harbor Health, and interview for jobs that start above $22 an hour.',
   'The people who care for Oakland should come from Oakland.',
   'Health system community-benefit programs, health foundations, and hospital workforce partnerships.',
   'Certifications earned, clinical hires, and retention at six months.',
   null, '$120K funds a healthcare cohort of 12 for a year.', 'New clinical partner in conversation.',
   'Monique Jackson opens doors at Harbor Health; keep the ask tied to local hiring data.', 3, -30),
  ('building-trades', 'Building Trades Pre-Apprenticeship', 'Building Trades', 'building', 'soft',
   'Ten fellows a year move from job-site visits to pre-apprenticeship placements with contractors like Redline Builders.',
   'Trades careers pay well without a four-year degree, but the path in is hard to see from the outside. Our trades track pairs OSHA-10, tool training, and paid job-site placements with contractors who hire.',
   'A union card is a career, not a job.',
   'Contractors, construction industry funds, and public infrastructure workforce programs.',
   'Pre-apprenticeship completions, apprenticeship entries, and starting wages.',
   null, '$75K funds the trades track for a year.', null,
   'Redline is the reference partner. Ask for placements first, money second.', 4, -45),
  ('san-leandro', 'San Leandro: The Fourth Site', 'San Leandro', 'new', 'primary',
   'Launchpad works at three Oakland high schools. San Leandro Unified has asked us to open a fourth site next fall.',
   'The district has the students and the space; we have the model and the employer network. Two cohorts of 40 at San Leandro High would bring Northbridge to 1,000 young people a year.',
   'Growth that a district asked for, built on a model that already works.',
   'National youth opportunity foundations, education foundations, and place-based funders.',
   'A clear launch plan, district commitment in writing, and the same outcomes we show in Oakland.',
   'The launch depends on one large decision this winter. A second funder makes it two cohorts instead of one.',
   '$300K over two years opens and runs the San Leandro site.', 'Decision pending on the lead grant.',
   'Meridian is the lead ask. Sequoia is the natural second; keep the timelines aligned.', 5, -6),
  ('employer-model', 'Employer-Led Workforce Model', 'Employer Model', 'productizing', 'neutral',
   'Employers who hire our graduates help pay for the training that makes those hires work.',
   'Twenty-four employer partners already host, hire, and mentor. The next step is a fee-for-service model: employers co-invest in onboarding and retention support for the young people they hire.',
   'When employers pay in, the pipeline lasts beyond any one grant.',
   'Employer partners, chambers of commerce, and corporate workforce budgets.',
   'Retention of hires at six and twelve months, and employer renewal rates.',
   null, 'Employer partners co-invest $5K–$25K a year for training and placement support.', null,
   'Pilot with Kinetic Labs first; Ravi Patel offered to help price it.', 6, -60),
  ('mentor-network', 'A Network, Not Just a Job', 'Mentor Network', 'proven', 'soft',
   'Every fellow leaves Northbridge with a professional mentor and a circle of adults who will take their call.',
   'Mentor Circles match working professionals with young people one to one, then bring them together monthly. Kinetic Labs alone sends twelve employee mentors.',
   'Who you know is not a shortcut. For most of our young people, it is the missing piece.',
   'Corporate volunteer programs, mentoring funders, and individual donors who mentor.',
   'Active matches, meeting frequency, and the share of fellows who say their mentor helped them get hired.',
   null, '$40K runs Mentor Circles for 60 young people for a year.', null,
   'Pair the ask with a volunteer invitation; most mentor-donors give after their first circle.', 7, -20),
  ('public-partnership', 'Public Workforce Partnership', 'Public Partnership', 'reframed', 'neutral',
   'We deliver what the public workforce system pays for: credentials, placements, and wages tracked to 90 days.',
   'The Eastshore Workforce Development Board contracts with Northbridge to run Pathways, and the state youth opportunity program funds two years of growth. Public dollars follow outcomes, and we report them.',
   'Public money is the most durable money, when the outcomes are real.',
   'Workforce development boards, state youth employment programs, and city economic development offices.',
   'Enrollment, credential, and placement counts on the contract''s reporting schedule.',
   'Cost-reimbursement contracts pay 30–45 days after each quarterly invoice, so cash planning matters.',
   'Multi-year contracts at $400K–$600K a year.', null,
   'Kwame owns invoicing; Remi owns the relationship with the board chair.', 8, -22)
) as a(k, name, nav, badge, tone, hook, frame, lead, funds, want, catch_body, ask, flag, approach, so, upd)
on conflict do nothing;

insert into public.strategy_room_meta
  (org_id, eyebrow, headline, headline_accent, subtitle, stats, this_year_heading, year_intro, this_year, created_at, updated_at)
select pg_temp.nb_org(),
       'Northbridge Youth Alliance · Northbridge ' || (pg_temp.fy() + 1),
       'Every Oakland kid deserves',
       'a first job and a network.',
       'Eight ways a funder can join the Northbridge ' || (pg_temp.fy() + 1) || ' plan, each tied to outcomes we report every quarter.',
       '[{"value": "750+", "label": "youth served each year"},
         {"value": "78%", "label": "employed 90 days after Pathways"},
         {"value": "$24.50", "label": "average starting wage, per hour"},
         {"value": "85", "label": "paid Summer Works interns"}]'::jsonb,
       'This year',
       'FY' || pg_temp.fy() || ' is year two of Northbridge ' || (pg_temp.fy() + 1) || '. Three things matter most:',
       jsonb_build_array(
         jsonb_build_object('label', 'Open San Leandro', 'body', 'A fourth Launchpad site next fall, funded by a two-year lead grant now under review.'),
         jsonb_build_object('label', 'Six months of reserves', 'body', 'A budgeted $150K surplus takes the reserve from 5.5 to 6 months by June.'),
         jsonb_build_object('label', 'Cohort 8', 'body', 'Thirty-six new fellows in IT support, healthcare, and the building trades, starting in the spring.')),
       pg_temp.nb6_at(pg_temp.nb6_launch() + 30, '11:00'), pg_temp.ts(-21, '14:10')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Impact report artifacts: exported reports are documents rows (doc_type
--    'impact_report', id = the draft's rid) with their waivers. The in-progress
--    funder update is a draft rid (URL state only) — see the report for its URL.
--    No storage objects are created, so "open" on an export has no file.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function pg_temp.nb6_fq(qend date) returns text language sql immutable as $$
  select 'FY' || pg_temp.nb6_fy(qend) || ' Q' || (((extract(month from qend)::int + 5) % 12) / 3 + 1)
$$;

insert into public.documents
  (id, org_id, storage_path, filename, mime, size_bytes, title, doc_type, status, visibility, version,
   uploaded_by, created_at, updated_at)
select pg_temp.nb_id('doc:' || r.k), pg_temp.nb_org(),
       pg_temp.nb_org() || '/' || pg_temp.nb_id('doc:' || r.k) || '/'
         || trim(both '-' from regexp_replace(lower(r.title), '[^a-z0-9]+', '-', 'g')) || '-' || r.c || '.html',
       trim(both '-' from regexp_replace(lower(r.title), '[^a-z0-9]+', '-', 'g')) || '-' || r.c || '.html',
       'text/html', r.bytes, r.title, 'impact_report', 'active', 'org', 1,
       pg_temp.nb_user(r.who), pg_temp.nb6_at(r.c, r.hhmi), pg_temp.nb6_at(r.c, r.hhmi)
from (
  select 'impact_annual' as k, 'FY' || (pg_temp.fy() - 1) || ' Annual Impact Summary' as title,
         least(pg_temp.fy_start() + 52, pg_temp.d(-3)) as c, '15:20' as hhmi, 'ben' as who, 48213 as bytes
  union all
  select 'impact_summer', 'Summer Works ' || extract(year from pg_temp.summer_start())::int || ' Outcomes Brief',
         least(pg_temp.summer_start() + 63, pg_temp.d(-2)), '11:45', 'simone', 31877
  union all
  select 'impact_q_prev1', pg_temp.nb6_fq((date_trunc('quarter', pg_temp.nb_anchor()) - interval '3 months' - interval '1 day')::date) || ' Funder Update',
         (date_trunc('quarter', pg_temp.nb_anchor()) - interval '3 months' - interval '1 day')::date + 24, '10:15', 'lena', 26540
  union all
  select 'impact_q_prev2', pg_temp.nb6_fq((date_trunc('quarter', pg_temp.nb_anchor()) - interval '6 months' - interval '1 day')::date) || ' Funder Update',
         (date_trunc('quarter', pg_temp.nb_anchor()) - interval '6 months' - interval '1 day')::date + 24, '10:40', 'lena', 25118
) r
on conflict do nothing;

-- Waivers written while those reports were drafted (artifact_id = the doc id).
insert into public.export_waivers (id, org_id, artifact_type, artifact_id, metric_key, waived_by, waived_at, reason, created_at)
select pg_temp.nb_id('waiver:' || w.k), pg_temp.nb_org(), 'impact_report', pg_temp.nb_id('doc:' || w.doc)::text, w.mkey,
       pg_temp.nb_remi(), d.created_at - interval '25 minutes', w.reason, d.created_at - interval '25 minutes'
from (values
  ('annual_placement', 'impact_annual', 'placement_rate',
   'Cohort 6 was still inside its 90-day window when this shipped. The summary reports the 60-day figure and says so on the page.'),
  ('q1_completion', 'impact_q_prev1', 'program_completion',
   'Completion definition is still being reconciled with the Hollis agreement. Reported our internal definition and footnoted the difference.')
) as w(k, doc, mkey, reason)
join public.documents d on d.id = pg_temp.nb_id('doc:' || w.doc) and d.org_id = pg_temp.nb_org()
on conflict do nothing;

commit;
