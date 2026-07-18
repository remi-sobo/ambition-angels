# Spec: Young Life EPA tenant onboarding (v2)

Status: v2, revised 2026-07-18 against the shipped platform — the v1 draft was written pre-Phase-D and is superseded by this file. Companions: `specs/bloomos-core-fence.md` (Phases B–C, **complete**), `specs/bloomos-participant-spine.md` (Phase D, **complete**), `specs/bloomos-import-layer.md` (Phase E, **complete**), `specs/bloomos-strategy-builders.md` (Phase F, **complete**), `docs/bloomos/safespace-onboarding.md` (the generic seeded-vs-self-serve checklist this instantiates).

**What changed from v1 in one paragraph:** the Stage-0 gate is satisfied (Step 13 default-drop applied and verified in prod; cutover done). Guardian/grade fields are no longer `students` columns — Phase D moved them to the per-org custom-field registry, so the seed now includes `custom_field_defs`. Campaigner/club status needs no interim `stage` hack — `participant_stages` is per-org data, so the seed installs her real lifecycle. The spreadsheet migration is self-serve through the Phase E CSV import wizard. The attendance UI already exists (sessions + roster-tap sheet). The strategy module (Phase F OGSM creator) is available but stays off in v1. And one **fatal** addition: `opportunities` carries a composite FK `(org_id, pipeline, stage) → pipeline_stages`, and the default-pipeline seed was a one-time backfill — a new org has zero rows and can never create an opportunity, so the seed now installs her default pipeline.

## Problem statement

BloomOS has never onboarded a real second tenant. The area director of Young Life East Palo Alto (the AD) runs a ~50-kid ministry across multiple schools out of a spreadsheet called "Kids Known by Name," phone notes, Google Docs, and her head. She must report two numbers to national monthly (kids known by name, program hours across all leaders) and has no system for either. Camp is her biggest annual operation and biggest scramble. Her committee is dormant and she wants it activated around fundraising. She has no clarity on her fundraising position ($160K goal, ~$110K raised, can't see runway).

BloomOS can be her system of record for people, program, and relationships on day one, almost entirely through configuration rather than construction.

## Who's affected

The AD (primary user, daily). Her leaders (2 today, growing; light usage later, not v1 users). Her committee (3 people, dormant; not v1 users). Remi (seeds and supports). Every future tenant (this is the paved road; Safespace becomes run two).

## Current behavior

No YL EPA org exists. The platform is ready for her: multi-tenancy fence complete (org-scoped writes, defaults dropped, RLS leak-tested per phase, org switcher, app.bloomos.org cutover), participant spine live (per-org stages, custom fields, terminology), CSV import wizard live for rosters and donors, strategy creator live. The invitations flow has never been used (0 rows ever) — she must not be its first user.

## Desired behavior

The AD signs in at app.bloomos.org and lands in an org named Young Life EPA. Sidebar shows her 9 modules, nothing else. The roster reads **Kids** and **Groups** (nav terminology); Leaders / Schools / Committee-meeting labels render on their entity surfaces. Her ~50 kids live as records with grade, guardians (custom fields), school (linked partner record), a campaigner/club lifecycle stage, and — after v1.5 recon — a linked leader. Club and Campaigners take attendance through the existing session sheet. Her two monthly numbers roll up in metrics with snapshot history. Her donors, touches, pledges, and pipeline live in fundraising with a goal she can see against actuals — and the pipeline **works**, because her org has stages. Camp deadlines and leader clearance live in compliance. AA sees none of it; she sees none of AA.

## The one architectural finding (unchanged from v1)

**BloomOS is not her ledger of record for money.** All donations flow through YL national (Salesforce), expenses through Workday. BloomOS's fundraising module is her relationship and pipeline system: donors, touches, pledges, monthly-donor tracking, and a goal thermometer fed by manually logged gift records that mirror national's numbers. No Stripe dependency for donations, ever, for this tenant. Camp payments route through whatever registration YL provides; BloomOS tracks the roster and who-owes-what, not the money movement. Finance module stays ON but lean: her budget and a manually maintained runway view, not transaction import.

## Scope

**In (v1, config + seed only, no code):**
- Org seed: `orgs`, `org_entitlements` (9 modules), `org_terminology` (5 rows), `org_email_allowlist` (owner)
- **Her lifecycle**: `participant_stages` (Contact → Club Kid → Campaigner → Graduated → Moved Away; confirm names with her)
- **Her kid fields**: `custom_field_defs` for grade, guardian name/email/phone (the D5 world — these are not columns anymore)
- **Her pipeline**: `pipelines` + `pipeline_stages` default ten-stage set (the composite-FK requirement; without it no opportunity can be created)
- Two `programs` rows: Club, Campaigners
- Two `metric_definitions`: kids_known_by_name (monthly), program_hours (monthly), manual snapshots
- Her schools as partner records (Ravenswood MS first — in-app, not SQL)
- Compliance items for camp contract deadlines (R1 spot request in January, the two escalating payment dates once she looks them up) and per-leader clearance (background check, driver form, videos) — in-app

**In (v1.5, small builds, each its own PR after the slim recon):**
- Kid→leader link (recon: can `relationships` a_id/b_id carry student↔constituent, or is a students-side column the honest answer)
- A Leader list surface (recon: what renders behind the volunteer entity type today)
- Metrics UI check (recon: can she create definitions/snapshots in-app, or is that still SQL)
- Nav-terminology fan-out (sidebar term keys cover student/cohort/staff today; extend to partner/board so the nav itself reads Schools/Committee)

**Out (later specs):**
- Camp module (roster, packing/logistics checklists, cabin/car assignments, contribution ledger): its own spec, the largest net-new build
- Leader self-service hours submission (v1: she enters the monthly total herself)
- Newsletter/comms, Salesforce/Workday integration (no API assumption; manual mirror), receipt capture for Workday expenses (YL national's lane)
- Strategy module — **available now** (Phase F creator shipped) but off in v1; her stated pain is scatter. One entitlement row turns it on when committee activation gets serious.
- Leader training content (a content problem, not software)

## Architecture sketch

Everything v1 is data rows against existing tables, per the data-over-code principle. Terminology via `org_terminology`. Modules via `org_entitlements` (unknown keys off). Kids in `students` — universal spine (name, email, phone, `partner_id`→school, `stage` from HER `participant_stages`) plus her `custom_fields` (grade, guardians) validated by the registry. Schools in `partners` relabeled. Committee on `board_members`/`board_meetings` relabeled. Attendance on `programs` → groups (`cohorts`, relabeled "Group") → sessions → `attendance` — **the session/roster-tap UI already exists**. Metrics on `metric_definitions`/`metric_snapshots`. Donors/touches/pledges/opportunities on the fundraising spine against her seeded pipeline; gifts entered manually as mirrors of national. The ~50-kid spreadsheet lands through `/admin/imports` (map columns onto spine + her custom fields, preview verdicts, commit — idempotent).

Key decisions unchanged: no new tables in v1; no code in v1; camp gets a spec before a line of code; nothing tenant-specific enters application code.

## Staged order

- **Stage 0 (gate): SATISFIED.** Runbook complete through Step 13 and cutover; verified in prod (50 product tables org_id NOT NULL, no defaults).
- **Stage 1:** Slim recon (Appendix B — three questions, read-and-report only).
- **Stage 2:** Exercise the invitations flow with a throwaway account (never used; she is not its first user). Also rehearses the seed end-to-end on a throwaway org: seed → invite → create a kid → create an opportunity (proves the pipeline FK) → import a 5-row CSV → verify AA isolation both directions → delete.
- **Stage 3:** Apply Appendix A seed (Remi, SQL editor, one transaction). Verify per DoD.
- **Stage 4:** Invite her. Guided first session: she enters 5 kids from her spreadsheet herself (if it takes her more than a minute a kid, that's a bug report), then imports the rest via the CSV wizard with Remi watching.
- **Stage 5:** v1.5 PRs as recon dictates, one at a time.

## Definition of done (v1)

She signs in and the greeting names her org. Sidebar shows exactly her 9 modules. Roster nav reads **Kids**; groups read **Groups**; a school partner record shows the **School** label on its entity surfaces. She creates a kid: the form offers HER stages (Contact/Club Kid/…) and HER custom fields (grade, guardians); SQL spot-check shows the YL org_id. She (or Remi) creates one opportunity — it saves, proving pipeline stages exist. The CSV wizard imports a 5-row test file with her fields mapped. Both metric definitions exist and accept a manual snapshot. One committee meeting record and one school record exist. AA's admin, signed in with AA active, shows zero YL records across fundraising, program, ops; the org switcher moves Remi between AA and YL EPA cleanly. The invitations flow has one successful throwaway acceptance before her invite.

## Failure modes

Seed skips the pipeline block: her first opportunity insert fails on the composite FK — loud, but embarrassing in a guided session; the Stage-2 rehearsal creates one opportunity precisely to catch this. Seed skips stages/custom fields: kid form renders AA-flavored starter stage labels and no guardian fields — cosmetic-looking but wrong-vocabulary; DoD checks both. Invitations flow breaks on first real use: Stage 2 exists to catch it. Terminology stragglers (surfaces that still hardcode Student/Partner): cosmetic; log and fan out in v1.5. She bounces off data entry: Stage 4's 5-kid test catches UX friction before the full 50.

## Open decisions (with recommendations)

1. **Kid label: "Kid" vs "Young person."** Recommend **Kid** (her national reporting language), revisit after a month. One SQL update either way.
2. **Module count.** Recommend **9**: fundraising, finance, program, partners, ops, board, compliance, documents, metrics. Meetings, messages, staff, strategy off until she asks. Metrics earns its slot: the monthly report is her hardest requirement.
3. **Her stage names.** RESOLVED 2026-07-18: Contact → Club Kid → Campaigner → Graduated → Moved Away confirmed (Club Kid and Campaigner are the engaged stages).
4. **Gift mirroring cadence.** She logs gifts as pledged/received, reconciles against national monthly, same rhythm as her metric snapshots. National import stays out (no Salesforce access assumption).
5. **Camp spec timing.** R1 contract deadline is January; write the camp spec in the fall so roster + contribution ledger exist before the headcount scramble. Payments stay out regardless.
6. **YL EPA takes the tenant-2 slot ahead of Safespace.** Assumed by this spec; Safespace becomes run two of the paved pattern. Confirm.

## Appendix A — YL EPA seed (Remi applies, one transaction)

```sql
-- Blanks RESOLVED 2026-07-18: owner is kendrasobo@gmail.com; stage names
-- confirmed. NO email_domain — deliberately. The membership bootstrap's
-- domain rule auto-grants staff to ANY signup matching settings->>'email_domain';
-- she is on a personal Gmail, so a domain rule would open her org to every
-- gmail.com signup. Access is allowlist-only (exact email match), which is
-- the correct shape for any personal-email tenant. Add future leaders /
-- committee members to org_email_allowlist individually.
begin;

with new_org as (
  insert into public.orgs (name, slug, settings)
  values ('Young Life EPA', 'young-life-epa', '{}'::jsonb)
  returning id
),
ents as (
  insert into public.org_entitlements (org_id, feature_key, enabled, source)
  select id, k, true, 'seed:younglife_epa' from new_org,
  unnest(array[
    'modules.fundraising','modules.finance','modules.program','modules.partners',
    'modules.ops','modules.board','modules.compliance','modules.documents',
    'modules.metrics'
  ]) as k
  returning org_id
),
terms as (
  insert into public.org_terminology (org_id, term_key, label)
  select distinct org_id, t.k, t.v from ents,
  (values
    ('student','Kid'),
    ('volunteer','Leader'),
    ('partner','School'),
    ('board_meeting','Committee meeting'),
    ('cohort','Group')
  ) as t(k, v)
  returning org_id
),
stages as (
  -- Her lifecycle (participant spine D3): per-org data, drives the roster
  -- funnel, the engaged counts, and the kid form's stage picker.
  insert into public.participant_stages
    (org_id, stage_key, label, sort_order, engaged, terminal, description)
  select distinct org_id, s.k, s.l, s.o, s.e, s.t, s.d from terms,
  (values
    ('contact',    'Contact',    1, false, false, 'Known by name — met at school or through a friend, not yet coming.'),
    ('club_kid',   'Club Kid',   2, true,  false, 'Coming to Club.'),
    ('campaigner', 'Campaigner', 3, true,  false, 'In Campaigners — the weekly Bible study.'),
    ('graduated',  'Graduated',  4, false, true,  'Finished high school.'),
    ('moved_away', 'Moved Away', 5, false, true,  'No longer in the area.')
  ) as s(k, l, o, e, t, d)
  returning org_id
),
fields as (
  -- Her kid fields (participant spine D1/D5): guardian/grade are registry
  -- custom fields now, NOT students columns. School rides students.partner_id.
  insert into public.custom_field_defs
    (org_id, entity_type, key, label, field_type, options, required, sort_order)
  select distinct org_id, 'student', f.k, f.l, f.t, f.o, false, f.s from stages,
  (values
    ('grade',          'Grade',          'select', '["6","7","8","9","10","11","12"]'::jsonb, 1),
    ('guardian_name',  'Guardian name',  'text',   null::jsonb, 2),
    ('guardian_phone', 'Guardian phone', 'phone',  null::jsonb, 3),
    ('guardian_email', 'Guardian email', 'email',  null::jsonb, 4)
  ) as f(k, l, t, o, s)
  returning org_id
),
pipe as (
  -- REQUIRED: opportunities has a composite FK (org_id, pipeline, stage) →
  -- pipeline_stages; the platform's default-pipeline seed was a one-time
  -- backfill over orgs existing at migration time. Without these rows she can
  -- never create an opportunity.
  insert into public.pipelines (org_id, key, label, sort_order, is_default)
  select distinct org_id, 'default', 'Pipeline', 0, true from fields
  returning org_id
),
pipe_stages as (
  insert into public.pipeline_stages
    (org_id, pipeline, key, label, sort_order, stage_type, probability_default)
  select distinct org_id, 'default', v.key, v.label, v.sort_order, v.stage_type, v.prob
  from pipe,
  (values
    ('identified',            'Identified',                        1, 'open',    10),
    ('researched',            'Researched',                        2, 'open',    20),
    ('needs_appointment',     'Needs Appointment',                 3, 'open',    30),
    ('appointment_scheduled', 'Appointment Scheduled',             4, 'open',    40),
    ('meeting_complete',      'Meeting Complete / Ready for Ask',  5, 'open',    60),
    ('ask_made',              'Ask Made',                          6, 'open',    75),
    ('pledged',               'Pledged',                           7, 'open',    90),
    ('closed_won',            'Closed Won',                        8, 'won',    100),
    ('closed_lost',           'Closed Lost',                       9, 'lost',     0),
    ('on_hold',               'On Hold',                          10, 'on_hold', null::int)
  ) as v(key, label, sort_order, stage_type, prob)
  returning org_id
),
progs as (
  insert into public.programs (org_id, name, description, active)
  select distinct org_id, p.n, p.d, true from pipe_stages,
  (values
    ('Club', 'Weekly main gathering'),
    ('Campaigners', 'Weekly Bible study')
  ) as p(n, d)
  returning org_id
),
mets as (
  insert into public.metric_definitions
    (org_id, metric_key, name, unit, direction, cadence, source_kind, active)
  select distinct org_id, m.k, m.n, m.u, 'up', 'monthly', 'manual', true
  from progs,
  (values
    ('kids_known_by_name', 'Kids known by name', 'kids'),
    ('program_hours', 'Program hours (all leaders)', 'hours')
  ) as m(k, n, u)
  returning org_id
)
insert into public.org_email_allowlist (email, org_id, role)
select distinct 'kendrasobo@gmail.com', org_id, 'owner'::org_role from mets;

commit;
-- Column names, enum values (metric direction/cadence/source_kind, pipeline
-- stage_type), and the opportunities→pipeline_stages FK were verified against
-- the live schema on 2026-07-18.
-- Then: Stage 2 throwaway rehearsal, then her real invite through the app.
-- Post-seed inserts done in-app, not SQL: Ravenswood Middle School as a
-- School (partner) record; camp-deadline compliance items once she confirms
-- the three contract dates; her groups (a Club group and a Campaigners group)
-- under the two programs.
```

## Appendix B — paste-ready recon prompt (slimmed; 4 of v1's 7 questions are answered)

```
Phase 0 recon for the Young Life EPA tenant (read-and-report ONLY — no code,
no migrations, no writes). Context: specs/younglife-epa-tenant-onboarding.md.
Already known, do NOT re-investigate: attendance UI exists (cohort sessions +
roster-tap sheet); participant stages and kid custom fields are per-org data
(Phase D); guardian fields are custom fields; the CSV import wizard covers the
roster; sidebar terminology covers student/cohort/staff keys only.

1. relationships table: what do a_id/b_id reference (FKs or convention)? Can
   it carry a student↔constituent link for kid→leader assignment, or is a
   students-side column the honest answer? Recommend one, with file paths.
2. Volunteer surface: entity_types routes 'volunteer' to a constituent detail
   page. What actually renders for a constituent tagged as a volunteer, and
   what is the smallest path to a "Leaders" list (constituents flagged as
   volunteers, relabeled per org_terminology)?
3. Metrics module: can an admin create metric_definitions and enter manual
   metric_snapshots through the UI today, or is that SQL-only? List routes.
Report as a numbered list with file paths. Flag anything that would make the
Appendix A seed unsafe as written.
```
