-- Strategy tab, Phase 1 — angles as data.
--
-- Moves the eight Strategy Room angles out of the hardcoded TS array
-- (app/strategy/StrategyRoom.tsx) into an editable table the admin tab reads.
-- The public page keeps rendering its hardcoded array until Phase 4 (separate
-- PR), so this migration does not touch the marketing page.
--
-- Conventions match create_opportunities.sql: resident-org default on org_id,
-- set_updated_at trigger, fundraising-domain RLS (read/write). Applied by hand
-- in the Supabase SQL editor. Idempotent: IF NOT EXISTS + ON CONFLICT DO
-- NOTHING, so re-running never clobbers edited angle copy.

create table if not exists strategy_angles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id),
  key           text not null,                 -- slug, e.g. 'economic-mobility'
  name          text not null,
  status_badge  text check (status_badge is null or status_badge in (
                  'north-star','proven','building','reframed',
                  'productizing','core-thesis','new','emerging-stub')),
  hook          text,                           -- north-star one-liner
  funds         text,                           -- who funds this
  want          text,                           -- what they want to see
  ask           text,                           -- ask range / model
  approach      text,                           -- cold vs warm reachability note
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, key)
);
create index if not exists strategy_angles_sort_idx on strategy_angles (sort_order);

do $$
declare
  aa uuid;
  t text := 'strategy_angles';
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

-- Seed the eight angles, verbatim from app/strategy/StrategyRoom.tsx. org_id
-- uses the resident-org default set above. ON CONFLICT keeps re-runs / later
-- admin edits intact.
insert into strategy_angles (key, name, status_badge, hook, funds, want, ask, approach, sort_order)
values
  ('economic-mobility','Economic Mobility','north-star',
   $a$We turn career exposure into economic mobility for the teens the system overlooks.$a$,
   $a$Ballmer Group (mobility-only, very large), Blue Meridian and StriveTogether, GreenLight Fund, Robin Hood, large community foundations.$a$,
   $a$Trajectory change, not activity counts. An evidence base with rigorous evaluation. Future Orientation Score growth. The 74% second-internship rate.$a$,
   $a$$250K to $1M+ per year, multi-year, unrestricted, performance-tied.$a$,
   $a$The largest funders source their own deals and reject cold proposals. This frame is the language that makes a warm intro convert, not an application. StriveTogether is the more reachable place-based door.$a$,
   1),
  ('place-based-rollout','Place-Based Rollout','proven',
   $a$We saturate one community at a time, prove it, then move.$a$,
   $a$Koshland (Oakland, renewing), Digging Deep (Silicon Valley rollout), StriveTogether and Ballmer place-based, city-anchored corporates and community foundations.$a$,
   $a$Percent of teens reached in a geography. Partner density inside a city. Local year-over-year outcome growth. A credible cost per city.$a$,
   $a$A city sponsorship model. Sell a city, not a line item. This is our cleanest validated angle.$a$,
   null, 2),
  ('workforce-pathways','Workforce Development and Career Pathways','building',
   $a$We don't just expose teens to careers. We walk them to the front door.$a$,
   $a$JPMorgan Chase (New Skills for Youth), Schultz Family Foundation (opportunity youth), Annie E. Casey, Strada, Ascendium. Atlanta cluster: Schultz, Blank, Rockefeller.$a$,
   $a$Pathways to real quality jobs. Next-step and credential attainment. Social capital and network growth. Earning-potential trajectory.$a$,
   $a$Program funding for coach cohorts, priced per teen served. Verify ambition before matching so volunteers never churn.$a$,
   null, 3),
  ('k12-buildout','K-12 Career Readiness Buildout','reframed',
   $a$Fund the infrastructure that lets one caring adult guide a hundred teens.$a$,
   $a$Gates Foundation, CZI, Overdeck (evidence-first), Ballmer (largest K-12 funder), career-pathways K-12 funds.$a$,
   $a$Proof of student outcomes first. Adult adoption and usage data. Evidence the tool moves the needle. A clear path off pilot into scale.$a$,
   $a$$450K to $600K for a discrete 12 to 18 month buildout, or fold into a multi-year $1M+ bundled with the program, which lands better.$a$,
   null, 4),
  ('employee-engagement','Corporate Employee Engagement','productizing',
   $a$Turn your employees into the mentors these teens have never had.$a$,
   $a$Twilio (Tanise, Danielle Morris, Jaiye), Pledge 1% companies (Okta, Zoom, Atlassian), Salesforce, Microsoft, Best Buy, Deloitte, CSR and Impact Fund managers.$a$,
   $a$Employee volunteer hours and participation. Engagement and retention lift. Teens mentored and pipeline diversity. Low lift to launch and easy to report.$a$,
   $a$A partnership package, sponsorship plus employee program bundled. Routing teens to the partner's own institutions often beats asking them to co-build content.$a$,
   null, 5),
  ('youth-development','Youth Development','core-thesis',
   $a$The teens who change are the ones with an adult tracking their progress.$a$,
   $a$Annie E. Casey Foundation, Wallace Foundation, positive youth development funders, Search Institute aligned funders.$a$,
   $a$Developmental relationships. Future Orientation Score. Sense of agency and persistence. The 74% second-internship rate as the hero stat.$a$,
   $a$Program or general operating support. The safest general-operating story. Lead here when the funder cares about the whole child, not just jobs.$a$,
   null, 6),
  ('responsible-ai','Responsible AI in Education','new',
   $a$We teach teens to use AI to sharpen their thinking, not outsource it.$a$,
   $a$Google.org, corporate AI-for-good funds, Tipping Point (Bay Area AI economy), learning-innovation funders.$a$,
   $a$AI augmenting, not replacing, adults. Critical-thinking and prompting skill growth. Responsible and equitable use with teens. A real product, not a press release.$a$,
   $a$An innovation grant. Frame as equitable AI access for under-resourced teens.$a$,
   null, 7),
  ('two-generation','Two-Generation and Parent Track','emerging-stub',
   $a$We equip the adults around the teen, not just the teen.$a$,
   $a$Aspen Ascend and two-gen funders, family-strengthening foundations, faith-rooted family philanthropies.$a$,
   $a$Whole-family outcomes. Parent engagement and capacity. Durable household-level change.$a$,
   $a$Pilot or explore. Keep this as a stub for now and do not lead with it.$a$,
   null, 8)
on conflict (org_id, key) do nothing;
