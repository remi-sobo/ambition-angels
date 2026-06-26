# Spec: Multi-tenant hardening — ready for tenant two

_Repo path: `specs/tenant-two-hardening.md`. Status: draft, awaiting approval. Scoping only — no code in this pass._

## Problem statement

BloomOS is built multi-tenant (every tenant table carries `org_id`, RLS is enabled, policies key on `has_permission(org_id, …)`), but it has only ever run one live tenant: Ambition Angels. Single-tenant operation hides three classes of latent cross-tenant bug that would surface the day a second org is onboarded:

1. **The `org_id` default trap.** `add_org_id_to_tenant_tables.sql` and the fundraising `create_*` migrations stamped a **hardcoded AA `org_id` as the column default** on ~45 tenant tables. Any insert that omits `org_id` silently lands in AA. Today everything *is* AA, so it "works"; for tenant two, their data routes into AA (or, under the session client, throws a confusing RLS error).
2. **Service-role routes bypass RLS entirely.** 82 of 142 admin route handlers use the service-role client (`lib/supabase/admin`), which switches RLS off. On those paths RLS is not a backstop — every query must scope `org_id` by hand, and one forgotten `.eq('org_id', …)` is a silent cross-tenant read or write.
3. **No current-org concept.** `getOrgContext()` returns the caller's *first* membership (`limit(1)`). Fine while every user belongs to exactly one org; the moment a user spans two orgs, writes can land in the wrong tenant.

The household work (PR #206) fixed exactly one table end to end (`households`: route sets `org_id` from session → default dropped). The RLS leak test was re-lit (PR #207) so cross-tenant regressions are caught in CI again. This spec scales the household pattern across the whole surface, using the now-green leak test as the safety net.

## Who's affected

Every future tenant admin, and AA itself the moment a second org exists in the same database. None of this is AA-specific — it is the floor for selling BloomOS to a second nonprofit.

## Current state (grounded in recon, 2026-06-25)

- **Default trap, ~45 tables.** Set by:
  - `add_org_id_to_tenant_tables.sql` (34): `donations, quiz_submissions, partner_waitlist, page_views, click_events, hs_contacts, hs_companies, hs_deals, hs_engagements, hs_sync_jobs, fr_prospect_scores, fr_prospect_briefs, fr_email_drafts, fr_touches, fr_agent_activity_log, fr_funding_opportunities, ops_projects, ops_tasks, meeting_types, bookings, blackouts, fin_categories, fin_budget, fin_revenue_commitments, fin_transactions, fin_imports, fin_category_rules, fin_config, ygb_registrations, ygb_attendance, demoday_notes, demoday_signups, bv_showcase_submissions, bv_newsletter_subscribers`.
  - `create_fundraising_core.sql` (11): `households, constituents, relationships, interactions, funds, campaigns, appeals, recurring_plans, gifts, soft_credits, acknowledgments`.
  - `create_opportunities.sql`, `create_grants.sql`, `create_segments.sql` (3): `opportunities, grants, segments`.
  - **Already dropped (3):** `households` (#206), `plan_goals` + `plan_initiatives` (`bloomos_strategy_phase1b`). Plus the newer strategy/agenda tables (`plan_*`, `plan_reviews`, `plan_kpi_snapshots`, `calendar_events`, `agenda_delegations`, etc.) — confirm their default status during Phase 0.
- **Client split: 82 service-role / 57 session, of 142 admin routes.** Service-role concentration by domain: finance 16, plan 13, partners 7, meet 7, ops 4, fundraising 4, cohorts 4, board 4, then a tail (compliance, briefing, applications, students, sessions, ygb, demoday, analytics, agenda, hubspot, kpis, programs, report, stats, submissions, integrations). Fundraising is mostly already on the session client (the reference pattern).
- **RLS + policies.** Enabled across tenant domains via `enable_rls_per_domain.sql`; fundraising invariants are CI-guarded by `assert_fundraising_org_id.sql`. Policy *coverage per domain is uneven* — some service-role-only domains may lack `has_permission` policies, which is why those routes never moved off service-role. Phase 0 inventories this.
- **Leak test.** `scripts/test-rls.sh` + `supabase/tests/rls-leak-test.sql` now green on `main`. It already asserts the tenant-two isolation matrix for the fundraising spine (`constituents, gifts, opportunities, grants, interactions, segments, hs_contacts`) and the service-only token stores (`connections, webhook_events`). Each domain phase extends this matrix.

## Two route classes (this distinction drives the whole plan)

- **User-facing routes** (the admin dashboard): a real Supabase session exists. These should move to the **session client** so RLS enforces `org_id` automatically (reads scoped, writes blocked by `WITH CHECK`). This is the household pattern.
- **System / ingest routes** (Stripe webhook, HubSpot sync, Gmail sync, cron jobs, public form intake): **no user session exists**, so they legitimately keep the service-role client — but must scope `org_id` **explicitly** in every read and write, because RLS is off for them. These never convert; they get an explicit-scoping audit instead.

Phase 0 tags each of the 82 service-role routes as *convertible* (user-facing) or *system* (stays service-role, explicit scoping).

## Desired end state

- No tenant table carries a hardcoded `org_id` default; a missing `org_id` fails loud (NOT NULL), never silently routes to AA. Enforced by a CI assertion guard.
- Every user-facing route uses the session client; RLS is the backstop, not hand-written filters.
- Every system/ingest route scopes `org_id` explicitly, verified by a checklist and (where possible) a test.
- `getOrgContext()` resolves an explicit *current* org, so a multi-org user can't write into the wrong tenant.
- The leak test asserts the isolation matrix for every tenant domain, and runs required on `main`.

## Strategy: vertical slices, one domain per phase

Rather than two horizontal sweeps (all defaults, then all routes), each phase takes **one domain end to end** so it is independently shippable, independently revertible, and provable by the leak test before moving on. Per domain:

```
a. Policy coverage  — ensure RLS + has_permission(org_id, '<domain>.read|write') policies exist for the domain's tables; add any missing.
b. Convert routes   — user-facing routes → session client; system routes → keep service-role but scope org_id explicitly.
c. Set org_id       — every writer sets org_id from getOrgContext() (or, session client, relies on RLS WITH CHECK).
d. Drop defaults     — drop the org_id default on the domain's tables (NOW safe: writers set it explicitly).
e. Extend leak test — add the domain's tables to the rls-leak-test.sql tenant-two matrix.
f. Verify           — green leak test (locally + CI) is the gate to ship the phase.
```

Strict ordering inside a phase: **(d) drop defaults only after (b)+(c) land**, or inserts hit NOT NULL violations. This is the same trap that the household phasing called out.

## Staged build order

Each phase is one PR, reversible, gated by a green leak test. Domains are ordered by exposure (sensitive data, route count) first.

- **Phase 0 — Inventory & guardrails (no behavior change).**
  - Per-table report: which tenant tables still carry an `org_id` default (settle the strategy/agenda table question).
  - Per-route tag: each of the 82 service-role routes → *convertible* or *system*, with the tables it touches.
  - Per-domain policy gap: which domains lack `has_permission` read/write policies.
  - Add a refactor of `rls-leak-test.sql` into a reusable per-domain assertion helper so later phases drop in tables cheaply.
  - Add a **tracking** assertion (report-only, not yet a hard gate) listing tables that still carry a default.
  - Deliverable: a short findings doc + the helper. Commit: `chore(rls): tenant-two inventory + leak-test domain helper`.

- **Phase 1 — Finance** (16 service-role routes; most sensitive). Tables: `fin_*`. Policies → session-client conversion for the dashboard routes; explicit scoping for any import/cron path → set `org_id` → drop `fin_*` defaults → extend matrix. Commit: `feat(finance): org-scope routes, drop org_id defaults`.

- **Phase 2 — Strategy / plan** (13 routes). Tables: `plan_*`, `plan_reviews`, `plan_kpi_snapshots`, strategy/funder angles. (`plan_goals`/`plan_initiatives` defaults already dropped — finish the set.) Commit: `feat(strategy): org-scope routes, drop org_id defaults`.

- **Phase 3 — Ops + agenda + calendar** (ops_tasks/ops_projects, agenda_delegations, calendar_events, calendar_sync_jobs). Note the `created_by`/owner columns interplay with `org_id`. Commit: `feat(ops): org-scope routes, drop org_id defaults`.

- **Phase 4 — Meet** (7 routes; `meeting_types, bookings, blackouts`). Caveat: anon must still read active `meeting_types` (the public `/meet` flow) — preserve that policy. Commit: `feat(meet): org-scope routes, drop org_id defaults`.

- **Phase 5 — Partners** (7 routes; `partners, partner_contacts, partner_interactions`). Commit: `feat(partners): org-scope routes, drop org_id defaults`.

- **Phase 6 — People domains** (board, cohorts, students, applications, sessions). Commit per sub-domain or grouped if policies align.

- **Phase 7 — Marketing / analytics / misc** (`donations, quiz_submissions, partner_waitlist, page_views, click_events, ygb_*, demoday_*, bv_*`). Many are public-intake (system routes): explicit `org_id` on the intake handler, then drop defaults. Watch the donations→gifts ingest trigger (the leak test already covers it).

- **Phase 8 — HubSpot / ingest sweep.** `hs_*`, `fr_*` staging + the sync/cron/webhook handlers. All system routes: explicit org scoping, no session conversion. Confirm `mark_hs_staging_readonly` invariants hold. Drop `hs_*`/`fr_*` defaults.

- **Phase 9 — Flip the guard.** Once every domain is converted, turn the Phase 0 tracking assertion into a **hard** CI gate: "no tenant table carries an `org_id` default" (a sibling to `assert_fundraising_org_id.sql`). Commit: `chore(db): assert zero org_id defaults on tenant tables`.

- **Phase 10 — `getOrgContext` current-org.** Introduce explicit current-org resolution (session/cookie/header), default to the sole membership when there's one, require a selection when there are several. This is the gate before onboarding a real second tenant whose admins might also belong to AA. Commit: `feat(auth): explicit current-org context`.

## Definition of done

- A non-AA org, created as a fresh membership, writes rows carrying THAT org's `org_id` across every domain — verified by the leak-test matrix, which now covers every tenant table.
- No tenant table carries an `org_id` default (CI-enforced).
- Every user-facing route uses the session client; every system route has an explicit, reviewed `org_id` scope.
- A multi-org user has a defined current org and cannot write into another.
- `Total raised` and every existing rollup read identically before and after each phase — hardening is behavior-neutral for the live AA tenant.

## Failure modes to watch for

- **Dropping a default before the writers set `org_id`** → NOT NULL violation, inserts break for everyone. Mitigation: strict in-phase order (d after b+c); the leak test's "default smuggle" assertion already guards the gift path.
- **Converting a system route to the session client** → it has no session, every call 401s. Mitigation: the Phase 0 convertible/system tag; never convert ingest/cron/webhook.
- **Missing `has_permission` policy on conversion** → a converted route reads/writes nothing (RLS denies all), looks like a silent outage. Mitigation: Phase (a) adds policies before (b).
- **Public-read regressions** (anon `/meet`, public donation intake) → over-tightening RLS breaks the public site. Mitigation: preserve the explicit anon policies; the leak test already asserts anon can read active meeting types and nothing else.
- **Service-role reads that join across orgs** → even with defaults dropped, a service-role `select` with no `org_id` filter still leaks. Mitigation: explicit-scoping audit is part of every phase, not just the default drop.
- **Big-bang temptation** → doing all defaults at once decouples the drop from the route fix and reintroduces the trap inverted (loud breakage instead of silent leak). Mitigation: vertical slices, one domain per PR.

## Open decisions

1. **Convert vs. explicit-scope for borderline routes.** Some "admin" routes run from cron/Cowork with a service token, not a user session (e.g. finance-balance, finance-reconcile skills). Treat those as system (explicit scope), not convertible. Confirm the list in Phase 0.
2. **Per-domain vs. grouped PRs for the long tail** (Phases 6–7). Group where policies are identical to keep PR count sane; split where they differ.
3. **Current-org transport** (Phase 10): cookie vs. subdomain vs. header. Recommend a signed cookie set by an org switcher, read in `getOrgContext()`. Out of scope until a real multi-org user exists.
4. **Backfill correctness.** Defaults were paired with a one-time `update … set org_id = AA where org_id is null`. Dropping the default doesn't touch existing rows; confirm no path still relies on the default for *existing*-row updates.

## Phase 0 kickoff prompt (paste-ready)

```
Recon only. Read and report. Do not change code.

Tenant-two hardening, Phase 0 inventory. Produce:
1. Every tenant table that still carries an org_id column default (query
   pg_attrdef / information_schema), including the strategy/agenda tables not
   covered by the original spec.
2. For each of the 82 service-role admin routes (grep lib/supabase/admin under
   app/api/admin), tag convertible (real user session) vs system (cron / webhook
   / public intake / service token), and list the tenant tables each touches.
3. Per domain, whether has_permission(org_id, '<domain>.read'|'.write') policies
   exist, or are missing (which is why the route stayed on service-role).
Report as three tables. No code. Stop for approval before Phase 1.
```
