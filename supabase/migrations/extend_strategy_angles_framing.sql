-- Strategy Room, Phase 4 — full framing fields on strategy_angles.
--
-- create_strategy_angles.sql moved the eight angles into a table, but only the
-- condensed funder-reachability fields (hook/funds/want/ask/approach). The
-- public Strategy Room (app/strategy/StrategyRoom.tsx) still rendered a richer
-- shape from a hardcoded array: a longer `frame` paragraph, a spoken `lead`
-- line, a typed `tone`, a per-angle `funds_label`, an optional `catch`
-- {label, body}, and an optional `flag`. This migration adds those columns so
-- the public page can read the table (Phase 4) and an admin can edit every
-- element — and a Reed-led wizard can write new angles complete.
--
-- Additive + idempotent: new columns are nullable, the tone check is added only
-- if absent, and the backfill only touches rows not yet backfilled
-- (nav_title is null), so a re-run never clobbers later admin edits.

alter table strategy_angles add column if not exists nav_title   text;
alter table strategy_angles add column if not exists tone        text;
alter table strategy_angles add column if not exists frame       text;
alter table strategy_angles add column if not exists lead        text;
alter table strategy_angles add column if not exists funds_label text;
alter table strategy_angles add column if not exists catch_label text;
alter table strategy_angles add column if not exists catch_body  text;
alter table strategy_angles add column if not exists flag        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'strategy_angles_tone_chk') then
    alter table strategy_angles add constraint strategy_angles_tone_chk
      check (tone is null or tone in ('primary', 'soft', 'neutral'));
  end if;
end $$;

-- Backfill the eight seeded angles with their full framing copy, verbatim from
-- app/strategy/StrategyRoom.tsx. Scoped to the resident org and guarded on
-- nav_title is null so this runs once and preserves any later edits.
update strategy_angles set
  nav_title = 'Economic Mobility',
  tone = 'primary',
  funds_label = 'Who funds this',
  frame = $a$We exist to break patterns of generational poverty. We give low-income teens the exposure, the skills, and the relationships to picture and reach an economically empowered future. The missing ingredient was never motivation. It was exposure. You can't be what you can't see.$a$,
  "lead" = $a$The goal is not one great program or one changed student. The goal is a city that gets better.$a$,
  catch_label = 'The catch',
  catch_body = $a$The largest funders source their own deals and reject cold proposals. This frame is the language that makes a warm intro convert, not an application. StriveTogether is the more reachable place-based door.$a$
where key = 'economic-mobility' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Place-Based Rollout',
  tone = 'primary',
  funds_label = 'Who funds this',
  frame = $a$Oakland was the proof. Koshland funded a three-year incubation and it worked. The model is repeatable. Go deep in one defined geography, build the trusted-adult network, reach density, document outcomes, then replicate. Silicon Valley is next, then LA, Atlanta, Houston, Detroit.$a$,
  "lead" = $a$We don't sprinkle. We saturate, and then we can prove what a place looks like when ambition is everywhere.$a$
where key = 'place-based-rollout' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Workforce and Pathways',
  tone = 'soft',
  funds_label = 'Who funds this',
  frame = $a$This is the deepest layer, Ambition Coach. We pair a teen with a professional who helps them research the path, define the next step, and find the next real opportunity. The kind of thing a parent with a network does without thinking. Most of our teens have never had that. It is virtual, high-touch, built for a smaller verified-ambition cohort.$a$,
  "lead" = $a$Exposure tells a teen the door exists. A coach helps them turn the handle.$a$
where key = 'workforce-pathways' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'K-12 Buildout',
  tone = 'soft',
  funds_label = 'Who funds this',
  frame = $a$The honest version. Do not pitch this as fund our app. Edtech as product is in a funding winter. Pitch instead the buildout of the trusted-adult dashboard, web-based access for students, and the school go-to-market motion as the infrastructure that makes outcomes durable and scalable. The tech enables the human layer. AI augments the adult, it never replaces them.$a$,
  "lead" = $a$We're not funding software. We're funding the thing that turns one adult into a hundred futures.$a$,
  flag = $a$The number is to be pressure-tested once we scope the real build.$a$
where key = 'k12-buildout' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Employee Engagement',
  tone = 'soft',
  funds_label = 'Who buys this',
  frame = $a$Ambition Coach and the corporate pitch are the same asset, two buyers. To a CSR team, Ambition Coach is a turnkey, virtual, skills-based volunteering program. Their employees mentor diverse teens, the company gets engagement, a talent pipeline, and impact it can report. This is already a mature funded category. Twilio.org runs Impact Corps, Salesforce gives seven paid volunteer days plus matching, Microsoft funds youth mentoring directly. We build it once and sell it as the repeatable Twilio template, then replicate to Netflix, eBay, a16z.$a$,
  "lead" = $a$Your people want to give back and don't have the time. We make it 30 minutes and unforgettable.$a$
where key = 'employee-engagement' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Youth Development',
  tone = 'primary',
  funds_label = 'Who funds this',
  frame = $a$The research-backed heart of everything. Career exposure plus a trusted adult. Teens who shift how they see their future are almost always connected to an adult tracking their progress. That is why the app alone is not the program. Three layers: exposure (the app), conversations (the adult dashboard), connections (Ambition Coach). The 74% second-internship completion rate is the proof that the human layer drives durable behavior change.$a$,
  "lead" = $a$A phone can show a teen a career. Only a person can convince them it's for them.$a$
where key = 'youth-development' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Responsible AI',
  tone = 'neutral',
  funds_label = 'Who funds this',
  frame = $a$A fundable story right now, with AI-economy money flooding the Bay Area. Our philosophy is AI as critic, not answer. Teens use AI to critique their own work, which builds critical thinking and prompting fluency. On the adult side, AI generates customized conversation prompts so any adult can become a youth educator. This matches what serious ed funders now demand of AI, that it augment the human work at the heart of learning rather than replace it.$a$,
  "lead" = $a$Everyone's worried AI will think for kids. We use it to teach kids to think harder.$a$
where key = 'responsible-ai' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;

update strategy_angles set
  nav_title = 'Two-Generation',
  tone = 'neutral',
  funds_label = 'Who funds this',
  frame = $a$A lighter, emerging angle worth keeping warm. The trusted-adult layer naturally extends to parents and mentors, equipping the whole circle around a teen rather than the teen in isolation. This maps to family-strengthening and two-generation funders. Align vocabulary carefully: trusted adult layer for grants, parent or mentor track for pitches, since the audiences overlap.$a$,
  "lead" = $a$Change one teen and you change a moment. Equip the adults around them and you change a household.$a$
where key = 'two-generation' and org_id = (select id from orgs where slug = 'ambition-angels') and nav_title is null;
