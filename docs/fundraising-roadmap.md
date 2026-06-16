# BloomOS Fundraising — Phased Build Plan

> Status: proposed (June 2026). Sequenced follow-on to the Phase 0B layout
> standardization (shared `Pipeline`, `PageHeader`, `DataTable`). This plan
> closes the gap between our fundraising stack and commercial nonprofit CRMs
> (Bloomerang, Virtuous, Salesforce NPSP, Instrumentl, Givebutter).

## Where we stand

Architecturally ahead of most commercial CRMs (single `gifts` revenue spine,
three-axis attribution, soft credits, households, IRS-compliant
acknowledgments, retention math, AI-native ack drafting + funder research) but
operationally behind: much of that model is **schema without UI**, and we lack
the "boring" surfaces every platform ships — batch gift entry, dedupe/merge, a
report builder, and donor communications/automation.

We are one org, not a SaaS vendor, so "on their level" means giving our team
the same day-to-day operating capability — not rebuilding a form-builder
marketplace. By that bar we're ~65–70% there, with the rest concentrated in a
handful of high-leverage areas.

## Guiding principles

- **UI-over-schema first.** Most Tier-1 value unlocks tables that already
  exist (`gifts`, `interactions`, `households`, `soft_credits`). Prefer UI +
  write-routes over new migrations.
- **Reuse the design system.** Every new surface uses `PageHeader`, `StatCard`,
  `DataTable`, `Pipeline`, and the existing form/control patterns
  (`GrantControls`, `CampaignControls`).
- **Single-org scope.** Build operating capability, not vendor surface area.
  Skip P2P / events / form marketplace.
- **Non-destructive.** New tables are additive; the `gifts` spine + Stripe
  ingestion trigger stay the system of record. Every write route is
  auth-gated and audit-logged (matching `app/api/admin/**`).

---

## Phase 1 — Operational parity *(makes it a CRM the team can run on)*

### Epic A — Manual & batch gift entry
The single biggest gap; today gifts only enter via Stripe.

| Ticket | Touches | Size |
|---|---|---|
| A1. `POST /api/admin/gifts` (amount, date, method, fund/campaign/appeal, deductible/FMV, constituent link or anon, notes) | new `app/api/admin/gifts/route.ts`; `gifts` | M |
| A2. `PATCH`/`DELETE /api/admin/gifts/[id]` | `app/api/admin/gifts/[id]/route.ts` | S |
| A3. Gift-entry form (single) + method-specific fields | new `GiftControls` in `donors/_components/`; donor detail + a `/admin/fundraising/gifts` page | M |
| A4. Batch entry (preset fund/campaign/date, rapid rows, running total) | extend form; `/admin/fundraising/gifts/batch` | M |

**Exit:** staff record a check/cash/stock/in-kind gift in <30s; it flows into
the timeline, rollups, retention math, and the acknowledgment queue. Stripe
untouched. **Deps:** none.

### Epic B — Constituent CRUD + interaction logging

| Ticket | Touches | Size |
|---|---|---|
| B1. `POST`/`PATCH /api/admin/constituents` | new `app/api/admin/constituents/**`; `constituents` | M |
| B2. `POST /api/admin/interactions` (call/email/meeting/event/note) | new `app/api/admin/interactions/route.ts`; `interactions` | S |
| B3. Add/Edit donor form + "Log interaction" composer | `donors/_components/` | M |

**Deps:** none.

### Epic C — Unified, interactive donor timeline

| Ticket | Touches | Size |
|---|---|---|
| C1. Merge gifts + interactions + acks + recurring into one stream | `donors/[id]/page.tsx`; new `DonorTimeline` | M |
| C2. Inline actions (log interaction, ack, add gift) | wires A/B into the stream | S |

**Deps:** A, B.

### Epic D — Households & soft credits

| Ticket | Touches | Size |
|---|---|---|
| D1. Household CRUD + members + giving rollup | new `app/api/admin/households/**`; `households`, `constituents.household_id` | M |
| D2. Soft-credit entry on a gift | new `app/api/admin/gifts/[id]/soft-credits/route.ts`; `soft_credits` | M |
| D3. Recognition-vs-revenue rollups | `lib/fundraising/` helper; donor + household panels | S |

**Deps:** A (gift detail surface).

**Phase 1 exit:** all daily fundraising ops run in-app without spreadsheets.

---

## Phase 2 — Reporting & money-in breadth

### Epic E — Report / saved-segment builder

| Ticket | Touches | Size |
|---|---|---|
| E1. Generalize export → query layer over gifts/donors/grants/campaigns | refactor `app/api/admin/donors/export` → `lib/fundraising/reporting.ts`; `app/api/admin/reports/route.ts` | L |
| E2. Saved segments | `segments` table **(migration already exists: `create_segments.sql`)**; `/admin/fundraising/reports` | M |
| E3. Report UI (entity, filters, columns, group/sum, export) | new page + `DataTable` | L |

**Deps:** none (E2 feeds I).

### Epic F — Pledges & installments

| Ticket | Touches | Size |
|---|---|---|
| F1. Migration: `pledges` + `pledge_payments` | new SQL; types | M |
| F2. Pledge CRUD + schedule generator; fulfilled payments link to `gifts` | `app/api/admin/pledges/**` | M |
| F3. `/admin/fundraising/pledges` list + detail (balance, overdue) | new page | M |

**Deps:** A.

### Epic G — Recurring-giving management

| Ticket | Touches | Size |
|---|---|---|
| G1. Recurring list + detail | new `/admin/fundraising/recurring`; `recurring_plans` | M |
| G2. Failed-payment recovery (from `invoice.payment_failed` webhook) → flag | extend `app/api/stripe-webhook`; donor timeline | M |
| G3. Manual recurring plan entry | `app/api/admin/recurring/**` | S |

**Deps:** B/C.

### Epic H — Donate page conversion & payment breadth

| Ticket | Touches | Size |
|---|---|---|
| H1. Apple/Google Pay + cover-the-fee | `app/donate`, `app/api/create-payment-intent` | M |
| H2. ACH; configurable suggested amounts | `app/donate`, DonateModal | M |
| H3. Stock / DAF intake → pending gift via A1 | `app/donate`; `app/api/admin/gifts` | S |

**Deps:** A.

---

## Phase 3 — Responsive fundraising *(highest ceiling — where Virtuous/Bloomerang lead)*

### Epic I — Donor communications (segment → send)

| Ticket | Touches | Size |
|---|---|---|
| I1. Migration: `email_campaigns`, `email_sends` | new SQL | M |
| I2. Compose + send to a saved segment via Resend batch; DNC/unsubscribe honored | `app/api/admin/comms/**`; reuse `lib/fundraising/receipt` html | L |
| I3. Comms UI (build, preview, send, results) | `/admin/fundraising/comms` | L |

**Deps:** E2 (segments).

### Epic J — Journey automation *(acts on retention signals we already compute)*

| Ticket | Touches | Size |
|---|---|---|
| J1. Migration: `journeys`, `journey_steps`, `journey_enrollments` | new SQL | M |
| J2. Trigger engine on Vercel Cron (first gift → welcome; LYBUNT/SYBUNT → re-engage) | `app/api/cron/journeys/route.ts`; `lib/fundraising/retention.ts` as source | L |
| J3. Journey builder UI (linear first) | `/admin/fundraising/journeys` | L |

**Deps:** I, retention math (exists).

### Epic K — Engagement score

| Ticket | Touches | Size |
|---|---|---|
| K1. `lib/fundraising/engagement.ts` — 0–100 from recency/frequency/amount/interactions | pure module + unit test | M |
| K2. Surface on donor list/detail; sortable; early-warning band | `DonorsTable`, donor detail | S |

**Deps:** B/C.

### Epic L — Enrichment & accounting sync

| Ticket | Touches | Size |
|---|---|---|
| L1. Wealth/firmographic API (DonorSearch / iWave) feeding briefs | `lib/agents/funder-research/*` | L |
| L2. QuickBooks Online sync via existing `funds.gl_code`/`qbo_class` | new `lib/finance/qbo.ts` | L |

**Deps:** none.

### Epic M — Data hygiene

| Ticket | Touches | Size |
|---|---|---|
| M1. Duplicate detection + merge (constituents) with audit | `app/api/admin/constituents/merge`; donor list | L |
| M2. CSV import wizard (map → validate → dedupe → commit) | `/admin/fundraising/import`; reuses A1 + M1 | L |

**Deps:** A, B, M1→M2.

---

## Sequencing

```
Phase 1:  A ─┬─> C ─┐
          B ─┘      ├─ Phase 1 exit (operable CRM)
          A ──> D ──┘
Phase 2:  E ─────────────> (feeds I)
          A ──> F
          B/C ─> G
          A ──> H
Phase 3:  E ──> I ──> J
          B/C ─> K
          (independent) L, M
```

**Recommended first sprint (~2 wks):** A1–A3 + B1–B2 + C1. The moment gift
entry, donor editing, and a unified timeline land together, the system crosses
from "dashboard" to "CRM."

**Migrations (additive only):** `pledges`/`pledge_payments` (F1),
`email_campaigns`/`email_sends` (I1),
`journeys`/`journey_steps`/`journey_enrollments` (J1). `segments` (E2) already
has a migration. Phase 1 and Epics G/H/K need **no schema changes**.

**Testing:** pure-logic tickets (K1 engagement, F2 schedule, D3 rollups) get
unit tests in `tests/` alongside `retention`/`availability`; UI verified on the
preview per the usual owner gate.

---

## Phase X — HubSpot two-way sync *(stand-alone **or** connected CRM)*

Goal: BloomOS works fully on its own, and *optionally* reads from and writes to
an org's existing HubSpot. **Off by default** — activates only when an org has
an active `connections` row (`provider='hubspot'`) with `meta.sync_out = true`,
so standalone behavior never changes.

**Agreed design decisions:**
- **System of record:** BloomOS is authoritative (protects the `gifts` revenue
  spine); HubSpot is kept in sync; inbound applies to HubSpot-owned contact
  fields. *(Configurable; flip to HubSpot-authoritative later if needed.)*
- **Scope:** all four object families — Constituents↔Contacts,
  Organizations↔Companies, Interactions↔Engagements, Gifts/Opportunities↔Deals.
- **Mechanism:** outbound push on local write + inbound HubSpot webhooks (the
  `connections` + `webhook_events` infra already exists).

**Foundations already present:** read-only import (`hs_*` mirror, `hs_sync_jobs`),
encrypted token store (`connections`), deduped inbound log (`webhook_events`),
and `constituents.external_ids.hubspot` linkage.

| Ticket | Touches | Size |
|---|---|---|
| X1. Write client + connection gate (off by default) | `lib/hubspot/client.ts` (`hubspotPost`/`hubspotPatch`), `lib/hubspot/connection.ts` | S |
| X2. Outbound Contacts/Companies push on constituent write | `lib/hubspot/sync-out.ts`; wired into `constituents` routes | M |
| X3. Outbound Interactions→Engagements | extend `sync-out`; wired into `interactions` route | M |
| X4. Outbound Gifts/Opportunities→Deals (or custom object) | extend `sync-out`; `gifts`/`opportunities` routes | L |
| X5. Durable outbound queue + retry (via `hs_sync_jobs`/Inngest) + upsert-by-email dedupe | sync infra | M |
| X6. Inbound webhook apply (HubSpot → BloomOS) | `app/api/webhooks/hubspot`, `webhook_events`, field-ownership apply | L |
| X7. Connection management UI (connect/disconnect, scope toggles, status) | new admin settings surface; `connections` | M |
| X8. Move token to encrypted `connections.access_token_enc` (off env) | `connection.ts`, crypto helper | M |

**Slices land independently; X1–X2 are the foundation (this PR).** Until X7,
connecting is a manual `connections` row; until X8, the token is the existing
`HUBSPOT_ACCESS_TOKEN` env var.

## Sizing key

S ≤ 1 day · M 2–4 days · L 1–2 weeks.
