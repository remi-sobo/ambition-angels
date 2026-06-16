# Fundraising v2 — Phase 0A: Real RLS (multi-tenant floor)

Spec: `specs/fundraising-v2.md` (Phase 0A). Goal: one org can never read or
write another org's fundraising data, enforced by Postgres row-level security
running under the authenticated user's session — not bypassed by the
service-role client. Ambition Angels (AA) is the only org today; nothing the
operator can do may break.

## What was already in place (DB layer)

Earlier Ring 1/Ring 2 migrations already gave **every** fundraising table
`org_id NOT NULL → orgs(id)` (default = the resident AA org) and org-scoped RLS
policies keyed on `private.has_permission(org_id, 'fundraising.read' /
'.write')`:

- `create_fundraising_core.sql` — constituents, households, relationships,
  interactions, funds, campaigns, appeals, recurring_plans, gifts,
  soft_credits, acknowledgments
- `create_opportunities.sql`, `create_grants.sql` (grants, grant_requirements),
  `create_segments.sql`
- `add_org_id_to_tenant_tables.sql` + `enable_rls_per_domain.sql` — the `fr_*`
  agent/scoring tables and the `hs_*` HubSpot mirror

The floor was not actually enforced for one reason: **every fundraising route
and page read/wrote through `getSupabaseAdmin()` (service-role), which bypasses
RLS.** RLS was a no-op for the app.

## What this change does

1. **Data-access swap.** All 18 fundraising API routes and 9 server-component
   pages now use `createServerSupabase()` (the user-session client) instead of
   `getSupabaseAdmin()`, so RLS applies to every per-request read and write.
   The `isAuthed()` gate stays on top (defense in depth). Every table these
   surfaces touch is in the `fundraising` permission domain — there are no
   cross-domain queries — so the AA owner (and staff) are unaffected.

2. **System paths stay service-role, by design.** Stripe ingestion
   (`api/stripe-webhook`, `api/save-donation`, the `donations → gifts`
   trigger) and the HubSpot sync (`api/admin/hubspot/sync`) keep the
   service-role client: they run without a user session and set `org_id`
   explicitly or via the column default. These are the documented, isolated
   exceptions.

3. **`hs_*` is read-only import staging.** `mark_hs_staging_readonly.sql` drops
   the member *write* policies on `hs_contacts/companies/deals/engagements/
   sync_jobs` (read stays) and documents each table as staging. No app path
   writes `hs_*`; only the service-role sync job does. `hs_*` is not the system
   of record — the spine (constituents/gifts/opportunities/interactions) is,
   reconciled via `external_ids`.

4. **Guard migration.** `assert_fundraising_org_id.sql` writes no schema; it
   fails loudly if any fundraising table ever loses `org_id NOT NULL`, its FK
   to `orgs`, or RLS. Makes the floor explicit and CI-checked.

### Intentional behavior note

`finance` and `board_viewer` roles hold no `fundraising.*` permission, so once
RLS is live they cannot read fundraising data through the app. **AA is
unaffected** — the only real users are Remi (owner) and Shannon (staff), both
fully permitted. This was a deliberate decision (leave as-is); revisit if a
finance/board persona ever needs fundraising read.

## Verification

### Automated (run against a DISPOSABLE Postgres)

```bash
# Cross-org isolation + role matrix (CI: .github/workflows/rls-test.yml)
DATABASE_URL=postgresql://.../scratch scripts/test-rls.sh
#   → "RLS leak test: ALL CHECKS PASSED"

# Operator-not-locked-out: AA owner reads all nine-page surfaces under RLS.
# Run on a DB that already has the migrations applied (e.g. right after the
# harness above leaves one).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fundraising-owner-smoke.sql
#   → "Fundraising owner smoke: ALL NINE-PAGE SURFACES READABLE BY AA OWNER"
```

`rls-leak-test.sql` now seeds a **second throwaway org + member** and asserts
the org-2 user reads **zero** AA fundraising rows and is **denied** inserts
(explicit AA org, and via the `org_id` default) and updates, while the AA owner
still reads and writes its own rows. That cross-org assertion is the Phase 0A
definition of done.

### Manual app smoke (do this once after applying the migrations to the real DB)

Sign in to BloomOS as the AA owner (Remi) and confirm each page renders its
data (these now read through the user session, so this proves RLS did not lock
the operator out):

1. `/admin/fundraising` — overview / opportunities pipeline
2. `/admin/fundraising/donors` — donor rollups + KPIs
3. `/admin/fundraising/donors/[id]` — a donor profile (giving, interactions)
4. `/admin/fundraising/grants` — grants pipeline + requirements calendar
5. `/admin/fundraising/grants/[id]` — a grant detail
6. `/admin/fundraising/campaigns` — campaigns + appeals + attribution
7. `/admin/fundraising/acknowledgments` — pending acknowledgment queue
8. `/admin/fundraising/prospects` — prospect list (hs_contacts + scores)
9. `/admin/fundraising/prospects/[hubspot_id]` — a prospect detail

Also exercise one write per area (create a grant, advance an opportunity, mark
an acknowledgment) to confirm writes still succeed for the owner.

## Apply order

These migrations are NOT auto-applied. Apply in this order after review:

1. `mark_hs_staging_readonly.sql`
2. `assert_fundraising_org_id.sql` (will raise if anything is wrong — that's the point)

The org_id columns and base RLS policies they assert on already shipped in
prior migrations; nothing here adds or backfills columns.

## Rollback

- **Data access:** revert the swapped files — each is a one-line change back
  from `createServerSupabase()` (`@/lib/supabase/server`) to
  `getSupabaseAdmin()` (`@/lib/supabase/admin`). With service-role restored,
  RLS is bypassed again exactly as before.
- **`hs_*` staging:** re-create the `members write hs_*` policies from
  `enable_rls_per_domain.sql` to restore member writes.
- **Guard:** `assert_fundraising_org_id.sql` is inert; dropping it changes
  nothing at runtime.

No destructive schema change is involved; org_id columns and policies are
untouched except the hs_* write-policy drop.
