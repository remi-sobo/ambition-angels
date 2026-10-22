-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6.5 — Cross-links that need rows from a LATER section than their
-- owner: funders placed on Section 6's eight strategy angles (Section 3b's
-- data, applied after 60_impact.sql creates the angles).
-- ════════════════════════════════════════════════════════════════════════════
begin;

create or replace function pg_temp.s35_con(k text) returns uuid language sql stable
  as $$ select id from public.constituents where id = pg_temp.nb_id('con:' || k) and org_id = pg_temp.nb_org() $$;

insert into public.funder_angles
  (id, org_id, constituent_id, angle_id, stage, decision, fit_notes, opportunity_id, prospect_id, created_by, created_at, updated_at)
select pg_temp.nb_id('fangle:' || f.angle || ':' || f.con), pg_temp.nb_org(), pg_temp.s35_con(f.con), pg_temp.nb_id('angle:' || f.angle),
       f.stage, f.decision, f.notes,
       case when f.opp is null then null else (select id from public.opportunities where id = pg_temp.nb_id('opp:' || f.opp)) end,
       case when f.prospect is null then null else (select id from public.fr_prospects where id = pg_temp.nb_id('prospect:' || f.prospect)) end,
       f.by, pg_temp.ts(f.created, '10:45'), pg_temp.ts(f.touched, '15:15')
from (values
  ('talent-pipeline', 'bayview', 'pursuing', 'pursue'::text, 'Three-year general operating partner; renewal conversation next fall.', null::text, null::text, 'remi', -400, -8),
  ('talent-pipeline', 'cypress', 'pursuing', 'pursue', 'Renewal LOI due in 18 days.', 'cypress_renewal', null, 'lena', -60, -3),
  ('talent-pipeline', 'alder', 'qualified', null, 'Declined last year; their new strategy names youth workforce. Re-cultivating through Dr. Freeman.', 'alder', null, 'lena', -90, -30),
  ('first-paycheck', 'pacific_summit', 'pursuing', 'pursue', 'Presenting sponsor; renewal proposal at $60K is in.', 'pacific_renewal', null, 'priya', -200, -10),
  ('first-paycheck', 'eastbay', 'pursuing', 'pursue', 'Funded stipends last year; renewal at $130K in the winter cycle.', 'eastbay_renewal', null, 'lena', -300, -20),
  ('first-paycheck', 'pl_greenleaf', 'researched', 'pursue', 'Invited a stipends proposal for their December docket.', 'greenleaf', null, 'lena', -45, -6),
  ('first-paycheck', 'pl_rotary', 'shortlist', null, 'Club grants up to $10K; inbound this week.', 'rotary', null, 'jordan', -1, -1),
  ('healthcare-workforce', 'harbor', 'pursuing', 'pursue', 'Community-benefit grant in; CNA sponsorship in negotiation.', 'harbor_cna', null, 'priya', -150, -14),
  ('healthcare-workforce', 'hollis', 'pursuing', 'pursue', 'Pathways funder; wants fellow-level outcomes in the interim report.', null, null, 'lena', -300, -1),
  ('healthcare-workforce', 'wu', 'pursuing', 'pursue', 'Naming gift for the healthcare track; ask meeting to schedule.', 'wu', 'wu', 'remi', -75, -11),
  ('healthcare-workforce', 'pl_lakeside', 'researched', null, 'Medical-assistant shortage across 14 clinics; Monique making the intro.', 'lakeside', 'lakeside', 'priya', -31, -5),
  ('building-trades', 'redline', 'pursuing', 'pursue', 'Reference partner; verbal yes for next summer.', 'redline_renewal', null, 'priya', -200, -9),
  ('building-trades', 'pl_halvorsen', 'qualified', null, 'Wants to see a Redline job site first.', 'halvorsen', null, 'priya', -40, -18),
  ('san-leandro', 'meridian', 'pursuing', 'pursue', 'Lead ask, $300K over two years; decision in about five weeks.', 'meridian', null, 'remi', -200, -2),
  ('san-leandro', 'sequoia', 'researched', 'pursue', 'Natural second funder; intro meeting in three days.', 'sequoia', 'sequoia', 'remi', -40, -4),
  ('employer-model', 'kinetic', 'pursuing', 'pursue', 'Pilot employer for the fee-for-service model; Ravi helping price it.', 'kinetic_match', null, 'priya', -150, -2),
  ('employer-model', 'pl_lumenfield', 'qualified', null, 'Second IT employer candidate; apprenticeship framing.', 'lumenfield', 'lumenfield', 'priya', -40, -12),
  ('mentor-network', 'kinetic', 'pursuing', 'pursue', 'Twelve employee mentors; volunteer program lead is Hana Sato.', null, null, 'priya', -150, -33),
  ('mentor-network', 'pl_pinecrest', 'passed', 'pass', 'Declined our Mentor Circles LOI: school-day programs only this cycle.', 'lost_pinecrest', null, 'lena', -200, -150),
  ('public-partnership', 'eastshore_wdb', 'pursuing', 'pursue', 'Year-one contract; Q1 invoice approved. Renewal RFP expected in spring.', null, null, 'lena', -200, -12),
  ('public-partnership', 'ca_yoi', 'pursuing', 'pursue', 'Year two of the award; budget amendment in signature.', null, null, 'lena', -420, -9)
) as f(angle, con, stage, decision, notes, opp, prospect, by, created, touched)
where pg_temp.s35_con(f.con) is not null
  and exists (select 1 from public.strategy_angles a where a.id = pg_temp.nb_id('angle:' || f.angle) and a.org_id = pg_temp.nb_org())
on conflict do nothing;

commit;
