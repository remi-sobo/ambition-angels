# Spec: BloomOS Strategy (the strategy, KPI, and culture layer)

> This makes BloomOS the system of record for Ambition Angels' strategy. KeyneLink and the 2026 OGSM PDF retire the same way HubSpot is retiring. After the one-time content lift in Phase 1, neither is opened again.
> Status: draft for Remi's review, reconciled with the Phase 0 recon (2026-06-18). Build does not start until the fundraising v2 cutover is done. This is design only.

---

## Problem statement

Remi runs Ambition Angels against a real strategy, but that strategy lives in two dead places. KeyneLink holds the identity layer (mission, vision, the 6 values, the 5 behaviors, the objectives and initiatives) in an ugly tool that's walled off from the actual work. The 2026 OGSM lives in a static PDF where every number is typed by hand and stale the moment it's saved. Neither one connects to the tasks and donor data already in BloomOS, so the plan and the work drift apart, and "did we move the needle this month" is a guess. Remi wants his strategy authored, tracked, and connected inside BloomOS: created here, seen here, tracked here, built here. He also wants this to be a real surface for the nonprofits who will run their own org on BloomOS later.

## Who is affected

- **Remi (CEO), first.** Authors the plan, runs the monthly review, reads the rollup on his home screen.
- **Shannon and future AA staff.** Own goals and initiatives, see their piece of the plan.
- **Tenant nonprofit leaders, later.** Land on an empty plan and need to get to a measurable one without a consultant.

## Current behavior

- `/admin/strategic-plan` is already a working goals-to-initiatives CRUD page (StatCards, a GoalCard per goal with a progress bar, initiative checkboxes, inline add-initiative). Phase 1 extends this, it is not a shell.
- The page and all six plan routes run on the service-role client (`getSupabaseAdmin`). The Phase 0A swap to the session client never reached the plan module, so RLS is bypassed here and `org_id` is never set from session.
- `plan_goals` and `plan_initiatives` already carry the hardcoded `org_id` default (`'17c75da8…'` = Ambition Angels). The org_id-default trap is live, not hypothetical.
- The rest of the strategy lives in KeyneLink and the OGSM PDF. KPIs are hand-entered and go stale.
- Nothing connects the plan to `ops_projects` / `ops_tasks`. A project has no idea which initiative it serves.

## Desired behavior

- Foundation (mission, vision, values, behaviors) and the full OGSM plan are authored and edited in BloomOS.
- KPIs auto-compute from BloomOS data wherever the data exists (dollars raised, grants submitted, active teens), and are entered manually only where no system can know them (FOS baseline, discovery interviews, processes documented).
- Every ops project can attach to an initiative, so task progress rolls up through initiative to goal to objective.
- Objective health rolls up by exception, so the CEO home shows four objective tiles and the few things that are red.
- The monthly OGSM review happens inside BloomOS (a review mode), not in a doc.
- A setup/refresh wizard helps shape loose intentions into measurable KPIs and wire them to data. It never invents strategy and never gates creation.
- KeyneLink and the OGSM PDF are retired.

## Scope

**In:**

- Five layers as real data: Foundation, Objectives, Goals, KPIs/Measures, Initiatives, with owners and status.
- Extend the two tables that already exist (`plan_goals`, `plan_initiatives`); add the missing ones (`plan_objectives`, `plan_kpis`, `plan_foundation`).
- The `ops_projects` to initiative link (the cascade).
- An auto-metric registry that computes KPI current values from BloomOS data.
- Two rollups: work (task to project to initiative to goal) and health (KPI to goal to objective).
- The CEO surface (Overview / Executive Briefing) reads the rollup.
- A monthly review mode.
- A one-time seed of AA's real strategy (Appendix A).
- The setup/refresh wizard and per-person views, as the final, tenant-facing phase.

**Out:**

- Enterprise HR machinery: compensation cycles, 9-box, engagement surveys, formal review cycles. Wrong size for a 2-person org and for most small-nonprofit tenants.
- Replacing the task system. This sits above it.
- Any AI that authors objectives or mission. The wizard shapes and measures; it does not invent.
- The build running before the fundraising v2 cutover.

## Architecture sketch

Grounded in the live schema (read 2026-06-18). What exists today:

```
plan_goals          org_id (DEFAULT = AA, drop it), title, description?,
                    target_date?, status check on_track·at_risk·behind·done,
                    sort_order. No owner, no objective_id.
  └─ plan_initiatives  goal_id NOT NULL, title, owner (exists!),
                       status check todo·doing·done, sort_order. No description.
ops_projects        org_id (DEFAULT = AA), category check (8 values:
                    fundraising·admin·board·recruitment·program·finance·
                    compliance·other), status('active'). No initiative_id.
  └─ ops_tasks       project_id, category (its own 8, incl. operations + product),
                     status todo·in_progress·blocked·done, parent_id, labels.
Routes: 6 plan routes, all service-role, all audit-logged.
RLS pattern to mirror: plan = read reports.read / write org.manage;
ops = ops.read / ops.write, all via has_permission(org_id, …).
```

Target object model. New tables marked NEW, changes marked EXTEND:

```
FOUNDATION   plan_foundation (NEW, one row per org)
             mission, vision, values jsonb[], behaviors jsonb[]
                 │  (slow-changing, the culture home)
                 ▼
OBJECTIVES   plan_objectives (NEW)            the 4 standing departments/categories
             title, three_year_statement, owner, status, sort_order, org_id
                 │   program · fundraising · recruitment · infrastructure
                 ▼
GOALS        plan_goals (EXTEND)              the SMART annual targets
             + objective_id FK, + owner       (keep title, description, target_date, status)
                 │
                 ├─► plan_kpis (NEW)          the Measures
                 │   goal_id | objective_id, title, unit, target, current,
                 │   owner, cadence, source('auto'|'manual'),
                 │   metric_key (nullable), status, last_updated_at, org_id
                 ▼
INITIATIVES  plan_initiatives (EXTEND)        the "how" / actions
             keep goal_id + owner, + description
                 │
                 ▼  (the link Remi asked for, Phase 2)
PROJECTS     ops_projects (EXTEND)            + initiative_id uuid NULL
             initiative_id = the only strategic link. category stays a loose
             ops tag, decoupled from the rollup (the 8 categories don't map
             cleanly to the 4 objectives, so we don't pretend they do).
                 │
                 ▼
TASKS        ops_tasks (unchanged)            rolls up through its project
```

**The connective tissue.** The recon killed the original idea that `category` could be the coarse strategic link. `ops_projects` has 8 categories and `ops_tasks` has a different 8, with no clean map to the 4 objectives. So the rollup flows through one honest path only: `initiative_id` on the project, carried up through goal to objective. `initiative_id` is nullable on purpose: strategic work attaches to an initiative, keep-the-lights-on work doesn't and rolls up nowhere. `category` stays exactly what it is today, a loose ops filter with no role in the strategy rollup. If a strategic project ever has no natural initiative, we add an optional `objective_id` to projects later, not now.

**The auto-metric registry (the thing that keeps the plan alive).** A named registry maps a `metric_key` to a function that computes a current value for an org from BloomOS data. A KPI with `source='auto'` and `metric_key='grants_submitted_ytd'` gets refreshed on a schedule. A KPI with `source='manual'` is entered at the monthly review. Examples:

| metric_key | reads from | auto/manual |
|---|---|---|
| dollars_raised_grants_ytd | gifts / grants | auto |
| grants_submitted_ytd | opportunities (type=grant) | auto |
| corporate_dollars_ytd | opportunities / partners | auto |
| donor_updates_sent_ytd | interactions | auto |
| active_teens | program / students | auto |
| fos_baseline, fos_growth | Empathy Labs analysis | manual |
| discovery_interviews_done | nothing knows this | manual |
| processes_documented | checklist | manual |
| filings_on_time | checklist | manual |

No AI in the auto path. These are cheap SQL counts and sums, cached and refreshed on a schedule, not per-page-load and not agent calls. This stays clear of the $20 cap.

**Rollups.**

- Work: task completion drives project progress, which drives initiative progress, which feeds its goal. A project's objective is derived through the chain (project to initiative to goal to objective), not from its category.
- Health: each KPI's current-vs-target sets its own status, which sets its goal's status, which sets its objective's status. The CEO home shows four tiles and the red items underneath. Management by exception.

**Status, deliberate decision.** Don't force one scale across all five layers. Strategy objects (objective, goal, KPI) use a health scale: `not_started · on_track · at_risk · behind · done`. Execution objects (initiative, project, task) use the progress scale already on tasks: `todo · in_progress · blocked · done`. A defined mapping lets a blocked project or a behind KPI surface red on its parent. A KPI isn't "in progress" and a task isn't "at risk," and pretending otherwise is what makes these tools feel wrong. (Open decision, see below.)

**Where it surfaces (real components, from recon).** The Overview home is `app/admin/_components/CommandCenter.tsx` → `RoleViewShell` → `CeoCockpit` / `OpsPanel`, with widgets composed from arrays and data from cached loaders in `lib/admin/overview/sources.ts`. The strategy rollup plugs in as a new cached source plus a cockpit widget: the four objectives with status, the KPIs that matter vs target, what's at risk, this week's priorities from Today's Moves, recent wins, a quiet values anchor, the monthly-review nudge. The Executive Briefing is `app/admin/briefing/` → `gatherBriefing()` (deterministic, no AI); the strategy signal slots in as a new source there. The executive view is a review layer: status and exceptions, not a wall of tasks.

## Staged build order

Each phase ships useful on its own. Build starts after the fundraising v2 cutover.

- **Phase 0: recon.** Claude Code reads the `/admin/strategic-plan` page and its routes and reports how they currently read `plan_goals` and `plan_initiatives`, before any code. Same read-and-report gate as Phase 0A. Commit point: a written recon, no code. **(Done — 2026-06-18.)**
- **Phase 1: the home.** Add `plan_foundation`, `plan_objectives`, `plan_kpis`; extend `plan_goals` (objective_id, owner) and `plan_initiatives` (description; owner already exists). Move the six plan routes off bare service-role so they set `org_id` from `getOrgContext()`, drop the hardcoded `org_id` default from the two existing tables, and normalize `plan_initiatives` status `doing`→`in_progress`. Manual CRUD for all of it. Seed AA's real strategy (Appendix A). Commit point: Remi can see and edit his whole strategy in BloomOS, and a second org can't write into AA. KeyneLink is now redundant.
- **Phase 2: the cascade.** Add nullable `initiative_id` to `ops_projects`. Wire the work rollup (task to project to initiative to goal), with the objective derived through the chain. Leave `category` alone. Commit point: attaching a project to an initiative moves that initiative's progress.
- **Phase 3: live measurement.** Build the auto-metric registry and the health rollup. Commit point: the fundraising and program KPIs show real numbers without anyone typing them.
- **Phase 4: the cockpit.** Surface the rollup on Overview / Executive Briefing. Build the monthly review mode (walk the four objectives, update manual KPIs, log notes, set next-review reminder). Commit point: Remi runs a monthly review entirely in BloomOS.
- **Phase 5: wizard and people (tenant / product).** The setup/refresh wizard (shape intentions into KPIs, tag auto vs manual, propose initiatives) and per-person views (the Performance Agreement: each person's objectives, KPIs, initiatives, next moves). Optional values-tagged recognition. Commit point: a brand-new tenant lands on an empty plan and leaves with a measurable one.

## Definition of done

- Remi opens BloomOS and sees all four objectives with live status. He never opens KeyneLink or the OGSM PDF again.
- At least the fundraising KPIs (dollars raised, grants submitted) and one program KPI (active teens) read real numbers with no hand-entry.
- A project attached to an initiative visibly advances that initiative's progress, and the initiative rolls up to its goal.
- A KPI going behind turns its goal yellow and flags its objective on the home screen.
- Remi completes a monthly review inside BloomOS: manual KPIs updated, notes logged, next review dated.
- Every strategy table, new and existing (`plan_goals` and `plan_initiatives` included), sets `org_id` from session context, not a column default, and a second org sees none of AA's strategy.

## Failure modes to watch for

- **It becomes another dead artifact, like the PDF.** Manifests as stale KPIs and a review that never runs. Mitigation: auto-KPIs carry as much load as possible, and the review mode hosts the ritual with reminders. If the auto path slips, the whole thing rots, so it's the priority of Phase 3.
- **Over-modeling people for a 2-person org.** Manifests as empty review-cycle screens nobody uses. Mitigation: for AA, owner field plus a per-person view, nothing more. The deeper machinery is gated to Phase 5 and aimed at tenants.
- **Forcing every task under a goal.** Manifests as a noisy, dishonest rollup where routine work inflates strategic progress. Mitigation: `initiative_id` is nullable, unlinked work rolls up nowhere, and `category` is not a strategic link (the recon proved it can't be).
- **The org_id default trap.** Manifests as a tenant seeing AA's strategy, the same pattern flagged in fundraising. Mitigation: session org_id on every new table, no hardcoded default.
- **Status conflation.** Manifests as a rollup that feels wrong because a task is being asked to be "at risk." Mitigation: two scales with an explicit mapping (decision below).
- **Wizard generates generic strategy.** Manifests as word-salad objectives that read like the things the voice guide bans. Mitigation: the wizard shapes and measures, never authors objectives or mission. AA skips it and uses the seed.
- **Auto-metric cost or slowness.** Manifests as slow pages or surprise spend. Mitigation: plain SQL counts and sums, scheduled refresh, cached, no AI, no per-page-load work.

## Open decisions for Remi

The recon turned these from open questions into recommendations. Confirm or override.

1. **Two status scales: recommended yes.** Health (`not_started · on_track · at_risk · behind · done`) for objective/goal/KPI, progress (`todo · in_progress · blocked · done`) for initiative/project/task, with a mapping so a blocked project or behind KPI shows red on its parent. Goals already use the health scale. Initiatives currently use `doing`, so normalize to `in_progress` so initiatives and tasks share one vocabulary (table is unseeded, so it's a constraint change, nothing to migrate).
2. **Objectives are NOT the category taxonomy (changed by recon).** The 8 free-text categories don't map to the 4 objectives. The rollup flows through `initiative_id` only, and `category` stays a loose ops tag. An optional `objective_id` on projects is a later add, only if a strategic project ever lacks an initiative.
3. **3-year layer: recommended as a `three_year_statement` field on each objective.** Skip the separate 14-objective tree unless you want KeyneLink's full structure.
4. **Drop the hardcoded `org_id` default from the live `plan_goals` / `plan_initiatives`: recommended yes.** Set `org_id` from session in the routes instead. Without it, a second tenant's goals write silently into Ambition Angels.

---

## Appendix A: Initial data load (AA's real strategy)

This is the one-time content lift, captured from what's in KeyneLink and the 2026 OGSM. Remi confirms it once in Phase 1, then the source docs retire. Owners shown as tokens where the source didn't specify.

### Foundation

- **Mission.** To empower low-income teens with career development, equipping them with the skills, confidence, and networks to succeed in life and work.
- **Vision.** To create a world where every young person, regardless of background, has the tools, support, and opportunities to build a thriving and purposeful career.
- **Values.** Agency. Human Flourishing. Innovation. Execution. Learning. Purpose.
- **Behaviors.** Disciplined. Agentic. Hustle. Productive. Problem Solver.

### Objective 1: Deliver an impactful program experience

*3-year: define and measure success, find the best formats, find new programmatic opportunities. 2026: establish a credible, validated FOS baseline and demonstrate measurable growth.*

Goals:

- Establish a documented FOS baseline from a minimum of 150 students, analyzed with Empathy Labs. *(KPI: fos_baseline, manual. WHO: [Remi / Empathy Labs])*
- Identify and document the top 3 drivers of teen engagement and completion in the app, via a three-condition pilot (money only, money plus adult, adult only), 200 to 300 teens. *(KPIs: teens recruited by condition, activation by condition, 30/60/90 retention by condition, auto from program data where available. WHO: [Remi])*
- Design, build, and pilot the adult engagement experience (dashboard, prompts, conversation guides) with at least 2 partner orgs. *(KPIs: discovery interviews done [manual], guides complete [manual], soft-test score [manual], adults converting to paid [auto]. WHO: [Remi / contractor])*

### Objective 2: Execute an effective and efficient fundraising strategy

*3-year: full-budget coverage through a diversified mix, plus a donor experience that drives long-term giving. 2026: reach full-budget coverage across foundations, corporate, individual, AIG, and earned revenue.*

Goals:

- Raise $400k+ from foundations and grants by submitting at least 12 grant applications. *(KPIs: dollars_raised_grants_ytd [auto], grants_submitted_ytd [auto]. WHO: [Remi])*
- Close at least 2 corporate partners (priority: Twilio, Monterra) generating $100k+ combined. *(KPIs: corporate partners closed [auto], corporate_dollars_ytd [auto]. WHO: [Remi])*
- Make meaningful progress on AIG: finalize the program plan, identify 10 prospects, make at least 5 asks. *(KPIs: AIG prospects [auto], AIG asks [auto]. WHO: [Remi])*
- Send at least 4 substantive donor updates with student impact highlights. *(KPI: donor_updates_sent_ytd [auto or manual]. WHO: [Remi])*

### Objective 3: Demonstrate the most effective and efficient recruitment strategy

*3-year: a proven, replicable partnership model, and an adult engagement model with parents and mentors as the primary drivers. 2026: build the partnership model that drives consistent recruitment and engagement.*

Goals:

- Reach 500 verified active teens on the app by end of Q3. *(KPI: active_teens [auto]. WHO: [Remi])*
- Complete and deploy a partner onboarding playbook that lets partners run independently. *(KPI: playbook sections complete [manual], partners onboarded with playbook [auto]. WHO: [Remi / contractor])*
- Pilot the adult engagement model with at least 2 partner orgs and 30+ parents or mentors enrolled. *(KPIs: partner orgs confirmed [manual], adults enrolled [auto], % linked to an active teen [auto]. WHO: [Remi])*

### Objective 4: Build a strong infrastructure for a sustainable organization

*3-year: a board that participates in fundraising and oversight; a team, systems, and culture that operate without founder dependency; consistent compliance as the org scales. 2026: same, with the filings and rhythms below.*

Goals:

- Complete all required financial and compliance filings on time: 990, RRF-1, SOS, payroll audits. *(KPI: filings_on_time [manual checklist]. WHO: [Shannon / Remi])*
- Conduct monthly OGSM reviews with the full team and document outcomes. *(KPI: reviews completed this year [auto, from the review mode itself]. WHO: [Remi])*
- Document at least 3 core operational processes so the org isn't dependent on Remi for execution. *(KPI: processes_documented [manual]. WHO: [Remi / Shannon])*

---

## Appendix B: Phase 1 migration plan (from Phase 0 recon)

Prose only. SQL gets written and handed to Remi to review and apply himself at greenlight, never auto-applied.

New tables, every one with `org_id NOT NULL references orgs(id)` and no column default, RLS enabled, mirroring the plan pattern (SELECT for `reports.read`, write ALL for `org.manage`, via `has_permission`):

- **`plan_foundation`**: one row per org, unique on `org_id`. `mission text`, `vision text`, `values jsonb default '[]'`, `behaviors jsonb default '[]'`, timestamps.
- **`plan_objectives`**: `title`, `three_year_statement text`, `owner text`, `status text default 'on_track'` (health scale), `sort_order`, timestamps.
- **`plan_kpis`**: `goal_id?`→plan_goals and `objective_id?`→plan_objectives (attach to one), `title`, `unit`, `target numeric`, `current numeric`, `owner`, `cadence`, `source text check (source in ('auto','manual')) default 'manual'`, `metric_key text` nullable, `status text default 'not_started'`, `last_updated_at`, timestamps.

Changes to existing tables:

- **`plan_goals`**: add `objective_id?`→plan_objectives, add `owner text`. Drop the hardcoded `org_id` default.
- **`plan_initiatives`**: add `description text`. Drop the hardcoded `org_id` default. Change the status check `todo·doing·done`→`todo·in_progress·done`, migrating any `doing` rows.
- **`ops_projects`** (Phase 2, not Phase 1): add `initiative_id uuid null`→plan_initiatives, ON DELETE SET NULL.

Route work that ships with Phase 1: the six plan routes set `org_id` from `getOrgContext()` and stop relying on the column default. Whether they move fully to the session client or keep service-role and set `org_id` explicitly is Claude Code's call at build, surfaced in the PR.

---

*Spec ends. No implementation code is part of this document.*
