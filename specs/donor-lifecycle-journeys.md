# Spec: Donor lifecycle stage + journey panel on the donor profile

Status: draft, awaiting approval
Repo destination: `specs/donor-lifecycle-journeys.md`
Depends on: existing Epic J tables (`journeys`, `journey_steps`, `journey_enrollments`)
Migrations required: none

## Universality note (read first)

This feature is for ALL users and ALL tenants. Nothing in it is customized for Ambition Angels or for any individual staff member.

- Lifecycle stage derivation is one shared function applied identically to every constituent in every org. No per-org or per-donor special cases in code.
- The journey panel renders on every donor profile in every tenant, driven entirely by that org's own `journeys` and `journey_enrollments` rows.
- Stage thresholds (major donor floor, lapse windows) ship as shared defaults. Per-org tuning is an explicit open decision routed to `org_terminology` / org config later, per the data-over-code rule. It is not built here.
- All writes set `org_id` from session context. Recon confirmed the three journey tables have no hardcoded `org_id` column defaults, so they are already clean. Keep them that way.

If any implementation step tempts you to branch on AA's org ID or a specific user, stop: that's a design failure, not a shortcut.

## Problem statement

A fundraiser opens a donor's profile and can see gifts, interactions, retention flags, and open asks, but not the two questions that drive stewardship: where is this person in their relationship with us, and what are we doing to move them forward? Lifecycle stage doesn't exist anywhere in the product. The Epic J journey engine is built and idle (0 journeys, 0 enrollments), and even if journeys existed, enrollment would be invisible from the donor 360 and there'd be no way to put an individual into a sequence by hand. Students already get a journey funnel (discover through launch); donors, the module that pays the bills, don't.

## Who's affected

- The ED/CEO persona (Remi at AA, every BloomOS customer's ED): needs at-a-glance relationship state during donor prep.
- The ops persona (Shannon at AA): needs to see and control which sequences a donor is in, and enroll someone after a phone call without touching the cron's auto-enroll logic.
- Every future tenant (Safespace first): gets the identical feature from day one with their own data.

## Current behavior

- Donor profile (`app/admin/fundraising/donors/[id]/page.tsx`) fetches constituents, gifts, plans, interactions, campaigns, funds, appeals, soft credits, opportunities. It does not fetch `journey_enrollments`. No stage concept exists.
- Donors table shows retention flags and engagement bands but no lifecycle stage.
- Journeys page (`/admin/fundraising/journeys`) can create sequences with `first_gift`, `lapsed`, `manual` triggers. The `manual` trigger exists in schema and UI copy but there is no surface anywhere to actually enroll a person manually.
- Live data: 3,755 constituents, 150 with at least one gift. So ~96% of AA's constituents are prospects under the derived model. Expect that shape at other tenants too.

## Desired behavior

- Every donor profile shows a lifecycle stage (Prospect, First-time, Repeat, Recurring, Major) rendered as the shared horizontal funnel component, same visual language as the student journey.
- Lapsed status appears as an overlay flag on the stage (existing retention flags), not as a separate stage. A lapsed major donor is still Major, visibly flagged.
- The profile shows a Journeys panel: active enrollments with journey name, current step X of Y, next send date, plus paused/completed history.
- An "Enroll in journey" action on the profile lists the org's `manual`-trigger journeys (and optionally any active journey) and creates an enrollment. `do_not_contact` donors can't be enrolled; the UI says why.
- The donors table gets a Stage column, filterable, replacing nothing (flags and bands stay).

## Scope

**In:**
- `lib/fundraising/lifecycle.ts`: pure derivation function, shared constants
- Stage on donor profile header + funnel strip
- Stage column and filter on the donors table
- Journeys panel on the donor profile (read)
- Manual enrollment API route + profile action (write)
- Unenroll/pause a single enrollment from the profile

**Out:**
- Any schema change (stage is derived at read time, no column)
- Per-org threshold configuration (open decision, later)
- New journey triggers (stage-transition triggers fold into Epic I Phase 6, the journey engine retrofit)
- Advocacy tracking, peer-to-peer, pre-CRM funnel stages (awareness/consideration live on the marketing site, not the admin)
- Journey builder changes, cron changes, send-path changes
- Backfilling or seeding any journeys (content is an ops task, not a build task)

## Architecture sketch

No new tables. One new lib, one new API route, two touched pages.

```
gifts + recurring_plans (existing reads on profile & donors pages)
        |
        v
lib/fundraising/lifecycle.ts
  deriveLifecycleStage({ giftCount, lifetimeAmount, hasActiveRecurringPlan })
  -> 'prospect' | 'first_time' | 'repeat' | 'recurring' | 'major'
  precedence: major > recurring > repeat > first_time > prospect
  constants: MAJOR_THRESHOLD = 10_000 (import the existing donors-page
  constant into the lib so there's exactly one definition)
        |
        +--> donor profile header (stage chip + funnel strip via shared
        |    Pipeline/funnel component, lapsed flags overlaid from
        |    existing retention.ts output)
        +--> donors table Stage column + filter tab

journey_enrollments + journeys + journey_steps (existing tables, RLS'd)
        |
        v
donor profile Journeys panel (server read, joined by constituent_id)
        ^
        |
POST /api/admin/journeys/[id]/enroll  { constituent_id }
  - org_id from session context (never a default)
  - reject if do_not_contact
  - reject if an active enrollment for (journey_id, constituent_id) exists
  - insert enrollment with status 'active', current_step 0,
    next_run_at = now() + step-1 delay, matching whatever the cron
    enroller writes (Phase 0 confirms the exact shape)
PATCH /api/admin/journeys/enrollments/[id]  { status: 'paused' | 'cancelled' }
```

Key decisions:
1. **Stage is derived, never stored.** Computed from giving data at read time. It can't rot, can't be dragged wrong, and needs no migration. Matches the "journey isn't a rigid funnel" reality: a returning donor just re-derives correctly.
2. **Lapsed is an overlay, not a stage.** Retention flags already own lapse detection. Duplicating it as a stage would create two disagreeing sources of truth.
3. **Manual enrollment reuses the cron's data contract exactly.** The API writes enrollments in the same shape the hourly cron writes, so the cron advances manual enrollments with zero changes to the send path.
4. **One threshold definition.** `MAJOR_DONOR_THRESHOLD` currently lives in the donors page; it moves to `lifecycle.ts` and the page imports it.

## Staged build order

**Phase 0: recon (gate, no code).** Claude Code reads and reports: the journeys API routes (does any enroll endpoint already exist?), the cron enroller (exact enrollment row shape it writes: `next_run_at` semantics, `current_step` starting value), `lib/fundraising/retention.ts` and `engagement.ts` exports, the donor profile page's data-fetch block, and the shared funnel/Pipeline component's props. Report findings; build starts only after review. Paste-ready prompt in Appendix A.

**Phase 1: lifecycle lib + stage display.** `lib/fundraising/lifecycle.ts` with tests, stage chip + funnel on the profile, Stage column + filter on the donors table. No writes anywhere.
Commit: `fundraising: derive donor lifecycle stage (profile + donors table)`

**Phase 2: journeys panel (read-only).** Profile fetches enrollments joined to journeys/steps; panel renders active + history; empty state links to /admin/fundraising/journeys.
Commit: `fundraising: journey enrollments visible on donor profile`

**Phase 3: manual enrollment (write).** Enroll route, pause/cancel route, profile actions, guards (do_not_contact, duplicate-active, org scoping from session).
Commit: `fundraising: manual journey enrollment from donor profile`

One PR per phase, small radius, each reversible by revert.

## Definition of done

- Opening any donor profile in any org shows a stage that matches hand-derivation from that donor's gifts and plans (spot-check 5 donors across stages, including one $10k+ and one active-recurring).
- A donor with LYBUNT/SYBUNT flags shows their true stage with the lapsed flag overlaid, not a "lapsed" stage.
- Donors table filters to exactly the set of, e.g., Recurring donors, and counts reconcile with the profile-level derivation.
- Enrolling a donor from their profile creates a `journey_enrollments` row whose shape the existing hourly cron advances without modification (verify: enrollment created manually reaches step 1 on the next cron run in a test journey).
- Enrolling a `do_not_contact` donor is refused with a visible message; no row is written.
- Enrolling the same donor in the same journey twice is refused while an active enrollment exists.
- All new rows carry the session org's `org_id`; querying as a hypothetical second tenant returns none of AA's enrollments (RLS spot-check via SQL).
- Zero migrations applied.

## Failure modes to watch for

1. **Manual enrollments the cron ignores or double-sends.** If the API writes `next_run_at` or `current_step` differently than the cron enroller does, manual enrollees silently never advance, or get step 1 twice. This is why Phase 0 must capture the cron's exact row shape before Phase 3 is written. Manifests as: Shannon enrolls someone, nothing ever sends, trust in the feature dies quietly.
2. **Stage derivation drifting from the donors-page rollups.** The donors page paginates all gifts for exact rollups; if the profile derives stage from a capped gift query, a 600-gift donor could show the wrong stage. Derive from the same full-history data the page already fetches (profile already pulls full date history for retention; extend, don't re-query).
3. **do_not_contact honored at enroll time but not send time.** A donor enrolled today who opts out tomorrow must not receive step 3. Phase 0 confirms the cron already checks `do_not_contact` at send (the journeys page copy claims it does); if it doesn't, that's a stop-the-line finding, fix goes in the cron, not papered over in the UI.
4. **Prospect flood making the stage column useless.** With ~96% prospects, a Stage filter defaulting to "all" is noise. Default the donors table interaction so stage adds signal (filter tabs, not a sea of "Prospect" chips). Cosmetic, but it's the difference between a feature and clutter.
5. **Second-tenant leakage.** Any query in the panel or enroll route that forgets org scoping shows AA's journeys to Safespace. RLS is the floor (policies confirmed present on all three tables), but routes must still set and filter `org_id` from session context.

## Open decisions (with recommendations)

1. **Per-org thresholds.** Ship shared defaults ($10k major; lapse windows already defined in retention.ts). Recommend: move to org config only when Safespace (or a paying tenant) asks, as a `org_terminology`-style data row, not code. Don't build the config UI now.
2. **Which journeys are manually enrollable.** Recommend: any active journey, not just `manual`-trigger ones. A fundraiser should be able to hand-place someone into the welcome series after a check arrives by mail. Guard is duplicate-active, not trigger type.
3. **Stage on the pipeline/opportunity cards.** Recommend: not now. Moves management stages and lifecycle stages are different axes; mixing them on cards invites confusion. Revisit after the feature has a month of use.
4. **Stage-transition journey triggers** (became recurring, crossed major). Recommend: name them now in `lifecycle.ts` docs, build them in Epic I Phase 6, not here.

## Appendix A: paste-ready Phase 0 recon prompt for Claude Code

```
Recon only. Do not write or modify any code. Read the repo and report.

Context: we're adding (1) a derived donor lifecycle stage, (2) a journey
enrollments panel on the donor profile, and (3) manual journey enrollment.
Before any build, I need ground truth on five things:

1. Journeys API surface: list every route under app/api/admin/journeys/
   (and any journey-related route elsewhere). For each: method, what it
   reads/writes, whether any enrollment-creation path already exists.

2. Cron enroller: find the hourly journey cron (check vercel.json / app/api
   cron routes). Report the exact row shape it inserts into
   journey_enrollments (every column value: status, current_step,
   next_run_at semantics, last_step_at) and the exact conditions for
   auto-enroll on first_gift and lapsed. Also report precisely where and
   when do_not_contact is checked: at enroll, at send, or both.

3. Lifecycle inputs: report the exported functions and types of
   lib/fundraising/retention.ts and lib/fundraising/engagement.ts, and
   where MAJOR_DONOR_THRESHOLD (10000) is defined and imported today.

4. Donor profile data fetch: paste the Promise.all block from
   app/admin/fundraising/donors/[id]/page.tsx and note whether the full
   gift-date history fetched for retention is sufficient to derive
   { giftCount, lifetimeAmount } without a new query, or whether amounts
   are capped/sampled.

5. Funnel component: report the props of the shared Pipeline component
   (app/admin/_components/Pipeline.tsx) and how the student journey funnel
   renders its stage strip, so the donor stage strip can reuse the same
   pattern.

Output: a findings report organized by the five items, with file paths and
relevant snippets. Flag anything that contradicts the assumptions above.
Stop after the report. Do not architect, do not build.
```

## Appendix B: draft SQL

None. This spec requires no migrations. If Phase 0 reveals a needed index
(e.g., journey_enrollments(constituent_id) for the profile join), Claude
produces reviewable SQL and Remi applies it via the Supabase dashboard,
per working agreement.
