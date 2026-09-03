# Missing-tables audit — September 3, 2026

Four tables are referenced by shipped code but do not exist in the `public`
schema of the production project (`kzzdtibbwsucloaoqpqa`), confirmed against
the live schema during this audit: `fr_plan_strategies`, `fr_plan_gift_levels`,
`ai_calls`, `program_partners`. This report traces every code path that touches
them, states how each breaks today, and hands over one reviewable SQL file per
table family for **manual application in the Supabase dashboard**. Nothing has
been applied by this audit.

## The SQL to apply (one file per table family)

| # | File | Status |
|---|------|--------|
| 1 | `supabase/migrations/fundraising_plan.sql` | Already committed; **never applied to prod**. One line added by this audit (search_path re-pin, see below). |
| 2 | `supabase/migrations/create_ai_calls_ledger.sql` | Already committed; **never applied to prod**. Unchanged. |
| 3 | `supabase/migrations/create_program_partners.sql` | **New** — drafted by this audit. |

The three files are independent of each other and can be applied in any order.
Each depends only on tables/functions verified present in prod (`orgs`,
`memberships`, `opportunities`, `grants`, `campaigns`, `private.has_permission`,
`set_updated_at`). All three are idempotent and safe to re-run.

**How this happened (worth fixing in process):** `fundraising_plan.sql` was
committed Sept 2 and registered in the RLS harness's ordered list, and the
migrations adjacent to it in that list (`create_plan_archives.sql`,
`create_work_blocks_and_calendar_prefs.sql`) *are* applied in prod — so this
one file was individually skipped in a manual apply batch. `create_ai_calls_ledger.sql`
(in the repo since the July 20 import) was likewise never applied. Migrations
are applied by hand with no applied-set tracking; a checklist or
`supabase migration` tracking would have caught both.

---

## 1. Code paths and failure modes, per table

### `fr_plan_strategies` + `fr_plan_gift_levels` (broken since deploy, Sept 2)

The unapplied migration also adds the `plan_strategy_id` column to
`opportunities`, `grants`, and `campaigns`, so those spine queries fail too —
but only inside the plan feature (`plan_strategy_id` is selected nowhere else).

**Reads — fail silently, which is the dangerous part:**

- `/admin/fundraising/plan` (`app/admin/fundraising/plan/page.tsx:70`): the
  `fr_plan_strategies` query errors (undefined_table) and the error field is
  never checked — `data` is null, coerced to `[]`. The three spine queries
  selecting `plan_strategy_id` fail the same way (undefined_column). The page
  renders the **"No plan for 2026 yet" empty state with $0 stat cards** —
  it looks like nobody has entered a plan, not like an outage. The 90-day ask
  calendar underneath still works (it doesn't touch the plan tables).
- `/admin/fundraising/plan/[id]` (`app/admin/fundraising/plan/[id]/page.tsx:58`):
  every strategy id renders **"Strategy not found — it may have been deleted."**

**Writes — fail loudly:**

- `POST /api/admin/fundraising/plan` (New strategy button) → insert throws
  42P01 → **500 "Could not create strategy"**. This is the visible symptom.
- `PATCH`/`DELETE` on the same route → 500 "Could not update/delete strategy".
- `PUT /api/admin/fundraising/plan/levels` (gift table editor) → the strategy
  lookup returns nothing → **404 "Strategy not found"**.
- `PATCH /api/admin/fundraising/plan/assign` (link an ask/grant/campaign) →
  404 "Strategy not found" when linking; when unlinking, the update writes the
  missing `plan_strategy_id` column → **500 "Could not update the link"**.

### `ai_calls` (dead since the ledger shipped — in the repo since at least July 20; ~6½ weeks)

Every access goes through `lib/ai/ledger.ts`, which is deliberately
fail-open/fail-silent, so **nothing errors — the numbers are just wrong**:

- `logAICall` (the append): insert fails, is caught, logged to console only.
  Every row written to the unified ledger since it shipped has been dropped.
- `monthToDateSpendUsd` → returns 0 on error → `orgOverAICap` (`lib/ai/cap.ts`)
  never trips → **the $100/month global org backstop has been inert at all
  7 call sites** (Reed ask, funder research, prospect discovery, next-move,
  next-best-action, grants coach, grants coach defend).
- `spendSummary` → returns an empty summary → the **"AI usage this month" card
  on `/admin/settings` has shown $0.00 the whole time** — actively wrong data,
  not a broken card.
- `GET /api/admin/ai-spend` returns an empty summary (no UI currently fetches it).

### `program_partners` (legacy; deliberately soft-failed)

- `GET /api/admin/programs` (`app/api/admin/programs/route.ts:27`): reads it
  via service role, catches 42P01/42703 explicitly and returns an empty
  payload — the **Programs section of `/admin/legacy` renders empty** by design.
- `supabase/migrations/create_partners.sql:87` carries a guarded import from it
  (`to_regclass` check) that currently skips with a notice.
- The public `/program-partners` signup form does **not** touch it anymore —
  `app/api/program-partner-signup/route.ts` was rerouted to the `partners`
  spine table (149 rows in prod, working). No signup data was ever in
  `program_partners` in production, so there is nothing to import or lose.

---

## 2. Reed and spend tracking — the precise statement

`ai_calls` does carry Reed's cost logging: `app/api/reed/ask/route.ts:190`
mirrors every Reed call into it. **Every one of those mirror rows has been
silently dropped since Reed shipped** (repo history squashes to the July 20
import commit, so at least 6½ weeks).

Two nuances so this lands accurately:

- Reed is **not entirely untracked**: its primary silo, `reed_activity_log`,
  exists in prod (12 rows) and drives Reed's own $25/month cap, which works.
  Likewise the fundraising surfaces' $20 wallet reads `fr_agent_activity_log`
  (14 rows), which works.
- What has been running with **no spend tracking at all** are the surfaces
  whose *only* ledger is `ai_calls`: **grants coach, grants coach defend, and
  strategy angle drafts**. Their calls are recorded nowhere, and their only
  cap — the $100 global backstop — reads `ai_calls`, gets 0, and never trips.
  The org-wide runaway-spend backstop has been non-functional across every AI
  surface for the same period. Actual dollar exposure is bounded by light
  usage (the silos show ~26 calls total), but the control has been an illusion.

---

## 3. `fundraising_plan.sql` review

Checked against the stated standard:

- **Covers both tables** — `fr_plan_strategies` and `fr_plan_gift_levels`,
  plus the `plan_strategy_id` spine columns and their partial indexes. ✔
- **`org_id` from session context, no hardcoded default** — both tables declare
  `org_id uuid not null references orgs(id)` with no default; the writers stamp
  it explicitly (`ctx.orgId` from `getOrgContext()` in
  `app/api/admin/fundraising/plan/route.ts:40`; the levels route stamps the
  parent strategy's `org_id`, not the caller's word). Passes the
  tenant-default ratchet. ✔
- **RLS in the same migration** — enabled on both tables with
  `private.has_permission(org_id, 'fundraising.read')` select and
  `…'fundraising.write'` all/with-check policies, in the same `do` block. ✔
- **Views with `security_invoker=on`** — the migration creates no views, so
  this check is vacuously satisfied. ✔

**One real defect found and fixed on this branch:** the file opens with
`create or replace function set_updated_at()`. Production's copy of that
function carries a pinned `search_path` (`pin_function_search_path.sql`,
Supabase lint 0011), and `create or replace` wipes a function's SET clause —
applying the file as it stood would have silently un-hardened every
`set_updated_at` trigger in the database. Added one line re-pinning the
search_path immediately after the function body. (No previously-applied
migration hit this: the other seven files recreating `set_updated_at` all
predate the pin.)

Minor note, no action needed: `supabase/tests/rls-leak-test.sql` has no
cross-tenant assertion for the `fr_plan_*` tables (they're only in the harness
apply list). Their policies follow the exact per-domain pattern the matrix
already exercises.

## 4. `program_partners` — drafted

`supabase/migrations/create_program_partners.sql` (new): the column set the
readers expect (`first_name`, `last_name`, `org_name`, `email`,
`program_type`, `teen_count`, `referral`, `created_at`), `org_id NOT NULL`
referencing `orgs` with **no default**, RLS enabled in the same migration with
`private.has_permission` policies on the program domain (matching `partners`),
idempotent throughout, no views. Registered in the RLS harness ordered list.

Be clear-eyed about what it buys: **no screen visibly changes**, because
nothing writes to this table anymore. It closes the schema gap so
`/api/admin/programs` reads a real (empty) table instead of trapping an error
code, and makes the guarded import in `create_partners.sql` runnable. The
longer-term cleanup — pointing `/admin/legacy`'s Programs section at
`partners`, then dropping this table and the legacy route — is a separate
decision.

## 5. `ai_calls` — located

`supabase/migrations/create_ai_calls_ledger.sql` already exists, and it meets
the bar: `org_id NOT NULL` referencing `orgs`, no default, RLS enabled in the
same migration, append-only policies (select + insert for org members, no
update/delete — mirroring `reed_activity_log`'s convention rather than
`has_permission`, which is deliberate: any member's AI call must be able to
append), idempotent, no views. It needs no changes — only applying. Note it is
a **membership**-scoped read (any org member can see spend), which is
consistent with its siblings.

---

## What comes back to life, per file

1. **`fundraising_plan.sql`** → `/admin/fundraising/plan` and
   `/admin/fundraising/plan/[id]` become fully functional: creating, editing,
   and deleting strategies; the gift-range table editor; linking asks, grants,
   and campaigns to strategies and the live committed/gap rollups built on
   those links.
2. **`create_ai_calls_ledger.sql`** → the "AI usage this month" card on
   `/admin/settings` starts showing real spend; the $100 global backstop
   becomes live at all 7 AI call sites; grants coach, coach defend, and
   strategy angle drafts get spend logging for the first time. (History is
   gone — the ledger starts at $0 from the moment of application; the silos
   retain Reed's and the fundraising agents' past calls.)
3. **`create_program_partners.sql`** → no user-visible change; schema
   integrity only (see §4).

## Contract 1 note

**Contract 1's Fundraising goal band has no source until `fundraising_plan.sql`
lands.** The plan's per-strategy goals (and their rollup) are the only place a
fundraising goal is entered as data; until the tables exist, any goal band
reads as $0 / absent, and nothing in the schema can back it.
