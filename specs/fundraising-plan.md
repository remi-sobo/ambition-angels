# Spec: Fundraising Plan (strategies, gift table, ask calendar)

**Status:** approved by Remi (2026-09-02), implementation in progress
**Owner:** Remi
**Origin:** gap analysis of the EPA YL Fundraising Hub v2 against BloomOS. Of the hub's
nine deltas, Remi picked three — the plan itself, the gift-range table, and ask timing —
plus two near-free hardening items agreed in review: trust labels scoped to the plan's
numbers, and an "asks due soon" queue on Today's Moves so the plan is self-enforcing.

## Problem statement

BloomOS tracks fundraising *records* (pipeline, grants, gifts, pledges) but has no
fundraising *plan*. The one FY goal lives in Finance, and nothing in the product can say
"we'll raise $200k as $120k major gifts + $30k monthly + $25k event + $25k grants," show
the gap per strategy, show the arithmetic underneath a major-gifts goal (gift size ×
count × names needed), or show which asks have to land in which month. That document is
the first thing any fundraising consultant produces, and today it lives outside Bloom —
which is why a client needed a standalone hub. The plan should live in Bloom, computed
from the records Bloom already keeps, so it is never a second source of truth.

## Scope

**In:**

- `fr_plan_strategies`: named strategies per org and plan year, each with a goal, an
  owner, and notes. Committed/pipeline roll up **live from the spine** — never typed in.
- Linking: nullable `plan_strategy_id` on `opportunities`, `grants`, and `campaigns`,
  so existing objects file under a strategy without duplication.
- `fr_plan_gift_levels`: the gift-range table per strategy (level amount × count
  needed), with a standard-pyramid generator and live "identified / committed" counts
  matched from real open and won opportunities.
- The Plan page (`/admin/fundraising/plan`): strategy cards with goal / committed /
  gap / pipeline / owner, a totals row ("where the money will come from"), and the ask
  calendar — the next 90 days of scheduled ask moments (opportunity expected closes,
  grant LOI/application/report deadlines, unpaid pledge installments) grouped by month.
- Strategy detail (`/admin/fundraising/plan/[id]`): the gift table, linked objects,
  edit goal/owner/notes, generate or edit gift levels.
- Trust labels **on plan surfaces only**: every rolled-up figure carries its
  provenance — `verified` (recorded gifts), `stated` (won opportunities, awarded
  grants, pledge schedules), `estimated` (weighted open pipeline), `placeholder`
  (a goal with nothing underneath). Rendered by one `TrustBadge` component.
- "Computed or absent": a strategy with no commitments shows a sentence, not a bar.
- Today's Moves gains one queue: **Asks due soon** — opportunity closes, grant
  requirement deadlines, and pledge installments due in the next 7 days (grants and
  pledges are not on Today at all right now).
- Nav: "Plan" joins the Fundraising sidebar and section bar.

**Out (deliberately):**

- Client mode / simple nav, magic-link auth, per-org theming — deferred until a client
  is onboarding onto Bloom.
- System-wide trust labels beyond the plan surfaces.
- The "three moves" ranked picker on Today's Moves (the new queue is the v1).
- Hours/capacity budgets, blockers, risks and open-questions registers (hub deltas
  Δ5/Δ6 and parts of Δ1) — the strategy table leaves room (notes) but no schema.
- Fiscal-year offsets. Plan years are calendar years, matching the pipeline board's
  `expected_close` scoping (`lib/fundraising/pipeline-year.ts`). An org-level fiscal
  year start is a later, additive migration.
- Editing spine objects from the plan (the plan links to them; edits happen on their
  own pages).

## Architecture sketch

```
                    ┌──────────────────────────────┐
                    │ fr_plan_strategies (new)      │
                    │  org, plan_year, name, goal,  │
                    │  owner, notes, sort           │
                    └──────┬───────────────┬───────┘
                           │ 1:n           │ 1:n
              ┌────────────▼───┐   ┌───────▼───────────────┐
              │ fr_plan_gift_  │   │ plan_strategy_id (new  │
              │ levels (new)   │   │ nullable FK) on:       │
              │ amount, count  │   │  opportunities         │
              └────────────────┘   │  grants                │
                                   │  campaigns             │
                                   └───────┬───────────────┘
                                           │ read-only rollup
        lib/fundraising/plan.ts  ◄─────────┘
        pure functions over fetched rows:
          rollupStrategy()   → committed (won opps + awarded grants
                               + gifts on linked campaigns), open pipeline,
                               weighted, gap, per-lane trust labels
          generateGiftLevels() → standard pyramid from a goal
          matchGiftLevels()    → identified/committed per level from opps
          upcomingAskMoments() → merged calendar rows from opps (expected_close),
                                 grant_requirements (due_date, open kinds),
                                 pledge_payments (due, unpaid)
          statusWord()         → plain-language "where it stands"

        Pages (server components, org-pinned reads like today/page.tsx):
          /admin/fundraising/plan          → cards + totals + 90-day calendar
          /admin/fundraising/plan/[id]     → gift table + linked objects + edit
        API (route handlers, fundraising.write via RLS + org pin):
          /api/admin/fundraising/plan            POST/PATCH strategy
          /api/admin/fundraising/plan/levels     PUT gift levels for a strategy
          /api/admin/fundraising/plan/assign     PATCH link/unlink an object
        Today's Moves: one added Promise in the existing Promise.all + one queue
        section fed by upcomingAskMoments(…, 7 days).
        Nav: lib/admin/nav.ts Fundraising section + tabs.
```

Rollup semantics (the double-count rule, stated rather than hidden): a strategy's
committed figure is the sum of three lanes — won linked opportunities (by
`expected_close` year, `WON_STAGE_KEYS`), awarded/active linked grants (`amount_awarded`),
and gifts dated in the plan year attributed to linked campaigns. The lanes are always
shown separately with their trust labels on the strategy card, so if an org links both a
campaign and the opportunities that produced its gifts to one strategy, the overlap is
visible instead of silent. v1 does not attempt gift↔opportunity reconciliation.

## Staged build order

- **Phase 0: this spec** — commit point (`specs/fundraising-plan.md`).
- **Phase 1: schema + domain logic** — migration `fundraising_plan.sql` (idempotent,
  RLS per `create_asks_log.sql` conventions, no org_id default) + `lib/fundraising/plan.ts`
  pure functions + `tests/fundraising-plan.test.ts`. Commit point: tests green.
- **Phase 2: the Plan page** — strategy cards, totals row, trust badges, create/edit
  strategy, nav entries. Commit point: page renders from seedable data, typecheck/lint
  green.
- **Phase 3: strategy detail + gift table** — pyramid generator UI, level matching,
  object linking. Commit point.
- **Phase 4: ask calendar + Today queue** — 90-day calendar on the Plan page; "Asks due
  soon" queue on `/admin/fundraising/today`. Commit point.

## Definition of done

- A strategy created with a $120k goal and three linked won opportunities totalling
  $45k shows committed $45,000 · gap $75,000 without any number being typed.
- Every figure on the Plan page carries a trust badge; a strategy with no linked
  commitments shows "Nothing committed yet…" prose and no progress bar.
- "Generate gift table" on a $120k strategy produces a descending pyramid summing to
  ≥ the goal; each level shows identified (open linked opps at that level) and
  committed (won) counts from real rows.
- The plan calendar lists an opportunity closing in 30 days, a grant LOI due in 45,
  and an unpaid pledge installment due in 60 — each linking to its own record.
- Today's Moves shows an "Asks due soon" queue whose rows disappear when the
  underlying close date passes, requirement is submitted, or installment is paid.
- `npm test`, `npx tsc --noEmit`, and `npm run lint` pass; the migration passes the
  idempotency guard and the RLS leak suite conventions (org-scoped policies on every
  new table).
- No new table has an org_id default; every page read pins `.eq("org_id", ctx.orgId)`.

## Failure modes to watch for

- **Double counting looks like success.** A campaign and its opportunities linked to
  one strategy inflate committed. Manifests as a gap that closes faster than money
  arrives. Mitigation: per-lane breakdown always visible; spec'd rule documented on
  the page's lane tooltips.
- **The plan drifts from the pipeline's own numbers.** If the plan's committed uses
  different stage/year semantics than `/admin/fundraising`'s KPIs, users see two
  "committed" figures. Mitigation: reuse `WON_STAGE_KEYS` / `OPEN_STAGE_KEYS` /
  `EXCLUDE_PARTNERSHIP_OPPS` and `expected_close`-year scoping — never a parallel
  definition.
- **Unlinked objects make the plan quietly wrong.** Money exists in Bloom that no
  strategy claims; the totals row understates. Manifests as "committed" on the plan
  below the pipeline's committed KPI. Mitigation: an explicit "Not in the plan" row
  showing unassigned won/open value, with a link to assign.
- **The calendar shows stale ask moments** (a submitted requirement, a paid
  installment) and trains users to ignore it. Mitigation: filter on open statuses at
  read time (`upcoming`/`in_progress` requirements, unpaid installments), never on a
  cached snapshot.
- **org_id leak on the new tables.** Copy-paste of an older migration with a default
  would stamp tenant one's id. Mitigation: follow the ratchet (no default; callers set
  org_id from context) and keep the new tables in the RLS policy loop.
