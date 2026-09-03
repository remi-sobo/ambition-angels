# The org_id-default trap — production backlog and what the ratchet actually checks

2026-09-03 · Prompted by the A1 review question: production carries twelve hardcoded AA `org_id` defaults, yet `scripts/test-rls.sh` reported a clean "tenant-default ratchet." Both are true. Here is why, with the allowlist printed instead of buried.

## What the ratchet asserts, exactly

`supabase/tests/tenant-default-ratchet.sql`, run by `scripts/test-rls.sh` as its last step, asserts **against the migration-built scratch database, never production**, that:

> the set of `public` tables with an `org_id` column default is a **subset of a frozen 62-table baseline** (snapshot 2026-06-30, shrunk only by deliberate edits since).

It fails only when a **new** table ships a default. It is a one-way ratchet by design — its own header says so, and points at tenant-two-hardening.md Phase 9, which will flip it to a hard ban ("assert the set is empty") once the defaults are gone. So:

- The twelve pass because **all twelve are in the baseline**. The ratchet was never built to flag them; they are the frozen debt it tolerates while hardening proceeds per-domain.
- A clean ratchet result means "Spec A's migration added no new default" — nothing more. It says nothing about production.

## The real backlog: production, verified via `pg_attrdef` 2026-09-03

Twelve tables, every default the AA UUID `17c75da8-082d-4c8f-b00b-a4100fb2eb22`:

`bv_showcase_submissions` · `click_events` · `demoday_notes` · `demoday_signups` · `hs_companies` · `hs_contacts` · `hs_deals` · `hs_engagements` · `hs_sync_jobs` · `page_views` · `partner_waitlist` · `quiz_submissions`

This is the one-migration cleanup already agreed in `docs/v2-draft-rulings.md` ("twelve column defaults, reviewable in a single pass"). Every one is flagged `org_id-trap table` in the preservation ledger.

## The allowlist (frozen baseline, 62 tables)

`acknowledgments, appeals, blackouts, board_meetings, board_members, bookings, briefings, bv_newsletter_subscribers, bv_showcase_submissions, campaigns, click_events, compliance_items, connection_candidates, connections, constituents, demoday_notes, demoday_signups, email_sends, fin_budget, fin_categories, fin_category_rules, fin_config, fin_imports, fin_revenue_commitments, fin_transactions, fr_agent_activity_log, fr_email_drafts, fr_funding_opportunities, fr_prospect_briefs, fr_prospect_scores, fr_touches, funder_angles, funds, gifts, grant_requirements, grants, hs_companies, hs_contacts, hs_deals, hs_engagements, hs_sync_jobs, interactions, journey_enrollments, journey_steps, journeys, meeting_types, opportunities, ops_projects, ops_tasks, page_views, partner_contacts, partner_interactions, partner_waitlist, partners, pledge_payments, pledges, quiz_submissions, recurring_plans, relationships, soft_credits, strategy_angles, strategy_room_meta`

Documented removals since the 2026-06-30 freeze (per the file's own changelog): `email_campaigns`, `segments` (comms drops); `kpi_settings`, `kpi_snapshots` (tables deleted); the eight program-spine tables (`students`, `cohorts`, `cohort_members`, `cohort_sessions`, `attendance`, `applications`, `ygb_registrations`, `ygb_attendance`); `donations`.

## The finding the question uncovered: the baseline is 50 tables stale, and the drift is real

Applying the repo's migration folder to a scratch database (exactly what the harness does) produces **62 tables with org_id defaults**. Production has **12**. The delta — 50 tables — had their defaults removed in production by hardening that is **not represented as replayable drop-default migrations in the repo** (only 7 migration files drop org_id defaults, covering ~14 tables: strategy phase1b, comms drops, donations, fr_prospects, households, program spine).

Two consequences worth stating plainly:

1. **The drift-guard's premise does not hold for `add_org_id_to_tenant_tables.sql`.** The idempotency test's stated safety property is "re-applying the whole folder is always safe." That file re-runs `alter column org_id set default '<AA uuid>'` on every table in its 34-table array on every apply — syntactically idempotent, semantically not: re-applying it to production would **re-install** AA defaults on tables production has already hardened. Nobody should ever re-apply that file, and it should say so at the top.
2. **The baseline is generous by 50 tables.** Any of those 50 could regress to a default via a future migration and the ratchet would stay green, because they're still allowlisted. When the twelve-table cleanup migration lands, it should also (a) shrink the baseline to match production truth, and (b) add a "never re-apply" guard or an unconditional `drop default` tail to `add_org_id_to_tenant_tables.sql` so the scratch build converges with production.

One quirk for the cleanup migration's author: `bv_newsletter_subscribers` is in the `add_org_id_to_tenant_tables` array and the baseline, but carries **no** default in production while its sibling `bv_showcase_submissions` does — evidence that the production hardening was piecemeal and hand-applied.

## Status

Nothing here blocks Spec A. A1's `export_waivers` carries no default (ratchet-verified on the scratch build, and true by construction). The twelve-table cleanup remains its own PR, per the signed rulings — now with the two additions above (baseline shrink + `add_org_id_to_tenant_tables` guard) folded into its scope.
