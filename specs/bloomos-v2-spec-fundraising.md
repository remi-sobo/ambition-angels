# Spec Fundraising — the second destination: Today + Donors & Funders + Pipeline + Grants + Campaigns

The second destination cutover, and the largest. Two people-lists become one.
Date: 2026-09-08 · Depends on: `docs/v2-recon.md` (§D.3, §F.1, §G), `docs/v2-preservation-ledger.md` (rulings R1, R6, R11, journeys, relationships), Spec A (all merged), Spec B (all merged), Spec Home (all merged). Second consumer of Contracts 2 and 3 on a screen.

---

## Problem statement

Fundraising is where Remi and Shannon spend their working hours, and it is V1's most fragmented section: nine tab-bar entries over fourteen routes, with the same person appearing in Donors, Prospects, Recurring, and Journeys as four different rows in four different lists. The V2 model (B1) collapses that to five tabs — Today, Donors & Funders, Pipeline, Grants, Campaigns — but three of the five seats don't exist yet: Donors & Funders and Pipeline are merge seats still pointing at their V1 sources, and Today is the V1 screen unchanged. This spec builds the missing screens and cuts the destination over.

## Who's affected

All four orgs hold `modules.fundraising`, so every tenant renders all five tabs. The prospect-research drawer (`ai.prospect_research`) renders only for AA and YGB — that asymmetry is exactly why R1 made it a drawer, not a sixth tab. Remi and Shannon are affected most; the 9-key orgs get the same five screens with less data behind them.

## Current behavior

`/admin/fundraising` renders the V1 pipeline board. Donors and Prospects are separate lists over `constituents` and `fr_prospects`; Recurring and Journeys are separate list pages; Asks is the ask log; Acknowledgments is its own queue; Today's Moves exists at `/admin/fundraising/today` and is already the KEPT_IN_PLACE landing for the V2 Fundraising destination. In the V2 shell, the Donors & Funders tab opens `/admin/fundraising/donors` and the Pipeline tab opens `/admin/fundraising/asks` (merge seats resolving to their first live V1 source).

## Desired behavior

One people-list: Donors & Funders over `constituents`, with rollups (lifetime giving, last touch, next move) and saved views — Prospects, Recurring, and promoted research prospects are *views of the one list*, not separate screens. One detail page: Donor 360. One pipeline: the board and the ask log on the same screen. Today keeps its path and gains the acknowledgment queue ("Thank someone"). At cutover the V1 routes 308 to their seats, `"fundraising"` joins `V2_CUTOVER_DESTINATIONS`, and every stored `notifications.url` donor/prospect shape resolves.

## Scope

**In.**
- The Donors & Funders screen at `/admin/fundraising/donors-funders`: the unified `constituents` list, rollup columns, built-in views, the R11 saved-view builder over `segments`.
- Donor 360 at `/admin/fundraising/donors-funders/[id]`: timeline, giving, open ask, connected, documents, reporting owed.
- The R1 prospect-research drawer off Donors & Funders (`ai.prospect_research`), absorbing the `/admin/fundraising/prospects` pipeline and the `funder_angles` briefs (R6).
- The Pipeline screen at `/admin/fundraising/pipeline`: the `opportunities` board merged with the ask log.
- Today staying at its path, absorbing "Thank someone" (`gifts.acknowledgment_status` + `reed_drafts`).
- The Fundraising cutover: activating eight map rows, flipping the tab slot, the config↔map agreement.

**Out.**
- Journeys as a feature — SIGNED dormant with a reserved seat in Donors & Funders, explicitly *not* a saved view. The seat stays empty; `/admin/fundraising/journeys` 308s to Donors & Funders at cutover and the dormant tables are untouched.
- Comms (`modules.comms`, R3: reserved section of Campaigns when Comms builds), Reports and fundraising Strategy pages (NO V2 HOME; the strategy briefs' content moves into the R1 drawer, the route stays put until then).
- `/admin/fundraising/pledges` → Finance → Forecast — that activation belongs to **Finance's spec** (Forecast must absorb the pledges tier first). The row stays at-cutover here.
- `/admin/fundraising/volunteers` → Programs → People — Programs' spec.
- Grants and Campaigns rebuilds: both are KEPT_IN_PLACE at their V2 paths already; their screens carry over as-is and restructure in a later pass if ever.
- Settings rows (duplicates, import, settings, stages) — they wait for a Settings seat; their pages stay live and unlisted.
- HubSpot sync changes of any kind.

## Architecture

### The screens and their sources (recon §G, all landed unless flagged)

| Screen | Source | Status |
|---|---|---|
| Donors & Funders list | `constituents` + rollups from `gifts` (lifetime), `interactions` (last touch), `opportunities` (next move); views over `segments` (R11) | exists |
| Donor 360 | `constituents`, `interactions` timeline, `opportunities`, `gifts` by year, `ops_tasks` via `linked_entity_type='constituent'`, `relationships` + `households` (connected — launches near-empty by signed ruling), `documents`/`document_links`, `grant_requirements` | exists |
| "Why they matter" | — | **UNBOUND** — open decision 1 |
| Prospect drawer | the eight `fr_*` tables + `funder_angles` (R1 + R6, all signed) | exists |
| Pipeline | `opportunities` + `pipelines`/`pipeline_stages` (board exists today) + `asks` log | exists |
| Today | goal band from `fr_plan_strategies` + `gifts`/`fin_revenue_commitments`/`pledges`/weighted `opportunities`; groups from `opportunities.next_step`; Thank someone from `gifts.acknowledgment_status` + `reed_drafts` | exists |

Every number renders through `<Metric>` or a canonical loader — Contract 2 applies from day one, same as Home.

### The one-list rule

`constituents` and `fr_prospects` are different tables with different UUID spaces, and both `/admin/fundraising/donors/[id]` and `/admin/fundraising/prospects/[id]` prefix-map to `donors-funders/[id]`. The 360 therefore resolves its `[id]` against `constituents` first and falls back to `fr_prospects`, rendering the prospect variant of the same screen (research brief, score, promote action) — one URL shape, both id spaces, no dead stored link. Promotion (`fr_prospect_promoted`) keeps writing a real constituent, at which point the same URL resolves to the donor variant.

### The cutover (same machinery as H3)

1. Screens exist → the Donors & Funders and Pipeline tabs stop resolving to V1 sources (`liveSeatFor` finds the ACTIVE targets; no seatless-set change — these were merge seats, never seatless).
2. `"fundraising"` joins `V2_CUTOVER_DESTINATIONS` → the tab slot flips to the V2 row (Today · Donors & Funders · Pipeline · Grants · Campaigns).
3. Eight rows move AT_CUTOVER → ACTIVE, in `lib/admin/v2routes.ts` **and** `next.config.mjs`, appended in matching order: `/admin/fundraising` → today (exact), `/plan` → campaigns (prefix), `/donors` → donors-funders (prefix), `/prospects` → donors-funders (prefix), `/asks` → pipeline (prefix), `/acknowledgments` → today (prefix; templates wait for Settings), `/recurring` → donors-funders (exact), `/journeys` → donors-funders (exact).
4. The stored `notifications.url` shapes (`/admin/fundraising/prospects/<uuid>`, `/admin/fundraising/donors/<uuid>`) land on Donor 360 through the prefix rows — the redirects test's "future" column becomes its present.
5. V1 pages are not deleted; they become unreachable behind their 308s, exactly like queue/briefing at H3.

## Staged build order

**F1 — Donors & Funders.** The list at `/admin/fundraising/donors-funders`: unified constituents, rollup columns, built-in views (All · Donors · Prospects · Recurring · Lapsed), the R11 saved-view builder persisting to `segments`. Reachable by URL only. Commit: `spec-fr: donors & funders`.

**F2 — Donor 360.** The detail at `…/donors-funders/[id]`, both id spaces, the panels above; "Why they matter" per decision 1. Commit: `spec-fr: donor 360`.

**F3 — Pipeline.** The board + ask log at `/admin/fundraising/pipeline`. Commit: `spec-fr: pipeline`.

**F4 — the R1 drawer.** Prospect research as a full-height drawer off Donors & Funders, `ai.prospect_research`-gated, absorbing the prospects pipeline UI and the R6 funder-angle briefs. Commit: `spec-fr: prospect research drawer`.

**F5 — Today.** Thank-someone absorbed; obligations per decision 2. Commit: `spec-fr: today's moves`.

**F6 — cutover.** Steps 1–5 above plus verification: four-org resolved-nav printout, live crawl of all eight 308s with query survival, both stored-shape notifications resolving to a real 360. Commit: `spec-fr: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As each of the four orgs, Fundraising lands on Today and renders exactly five tabs; the drawer control appears only for AA and YGB.
2. One person, one row: a constituent who gives, gives monthly, and was a promoted prospect appears once in Donors & Funders, with views filtering — never duplicating — the list.
3. Every stored donor/prospect `notifications.url` opens a Donor 360 that renders (both id spaces).
4. A saved view built in the R11 builder persists to `segments`, survives reload, and is org-fenced.
5. The eight 308s hold with query strings; `/admin/fundraising/today`, `/grants`, `/campaigns` are fixed points; config↔map tests stay green.
6. The journeys seat renders nothing and the dormant tables are untouched — the reserved seat is a comment and a ruling, not UI.
7. With the V2 flag off, everything except the eight 308s is byte-for-byte V1.

## Failure modes

**The merge lies.** Donors + prospects in one list invites double-counting (a promoted prospect with a constituent row and a stale `fr_prospects` row). The list keys on `constituents.id`; un-promoted prospects appear only in the Prospects view, and DoD 2 tests the promoted case explicitly.

**Rollup cost.** 3,631 constituents × three rollups is a real query. Rollups compute in one set-based query (or a view), never per-row; the list paginates server-side.

**The drawer becomes a tab.** Scope creep re-widening the tab row per-tenant is exactly what R1 forbids. The drawer renders zero chrome without `ai.prospect_research`.

**Acknowledgment regressions.** "Thank someone" moves a live queue (`gifts.acknowledgment_status`). The V1 acknowledgments page keeps working until its 308 lands at F6, and the Today block reads the same status field — one write path throughout.

**Redirect loop.** `/admin/fundraising/today` is both a 308 target and a kept path — the fixed-point test covers it the moment the rows activate.

## Open decisions (need Remi's ruling before their stage)

1. **"Why they matter" (Donor 360) — recon marks it UNBOUND.** Recommend: an additive `constituents.why_matters` text column, written by a human in the 360; Reed may draft into `reed_drafts` for approval but never writes the column directly. Needed by F2.
2. **Do fundraising follow-ups join `v_obligations`?** Overdue next-steps and unacknowledged gifts are obligations in every honest sense, and Home's Needs-you is the one door now. Recommend: yes — two additive arms (owner-required, capped like `metric_stale`, honest `why_it_matters` lines), shipped as an A-style additive migration in F5, so Fundraising Today becomes the *detail* surface and Home stays the *decision* surface. Needed by F5.
3. **Lapsed view definition.** "Lapsed" needs a rule (recommend: gave in a prior fiscal year, nothing in the current one — computed, not stored). Needed by F1.

---

*Drafted 2026-09-08, pending Remi's approval. F1 begins only on his kickoff.*
