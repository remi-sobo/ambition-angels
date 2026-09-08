# Spec Home — the first destination: Home (Today + Organization Health)

The first destination cutover. One door instead of five.
Date: 2026-09-08 · Depends on: `docs/v2-recon.md` (§A, §D.3, §F, §G), `docs/v2-preservation-ledger.md`, Spec A (all six stages merged), Spec B (all six stages merged). First consumer of Contracts 2 and 3 on a screen.

---

## Problem statement

Five surfaces answer "what needs me" today: the Command Center cockpit at `/admin`, `/admin/queue`, `/admin/briefing`, the right rail, and half of Inbox. A user picks a door before starting work, and each door ranks the same underlying obligations differently. The V2 shell (B1–B6) is live behind the per-user flag, but every destination still hosts V1 pages — Home doesn't exist yet, so the flag shows a new chrome around the old cockpit. Home is the destination that replaces the five doors with one: **Today** says what needs you and why, **Organization Health** says how the org is doing and why.

## Who's affected

All four orgs. Remi and Shannon most (they live in the cockpit/queue/briefing triangle today). The two 9-key orgs get Today with fewer sources feeding it and Organization Health rendering 5 of its 7 rows (strategy + team rows are unentitled — recon §D.3). Every V1 user is also affected at cutover: the `/admin/queue` and `/admin/briefing` redirects are global, so those doors land on Today for everyone — the flag governs chrome, not screens, exactly as B2's active rows already work.

## Current behavior

`/admin` renders the Command Center cockpit (authed) or the login screen (unauthed). `/admin/queue` renders the action-queue list from `lib/admin/actionQueue.ts`; `/admin/briefing` renders the executive briefing from the briefing engine. In the V2 shell, Home's sidebar row links to `/admin` (the pre-cutover live seat) and the Organization Health tab is hidden (its screen doesn't exist — the pinned seatless set in `tests/v2-shell.test.ts`).

## Desired behavior

The Home sidebar row lands on `/admin/today`. Today shows: an orientation line, **Needs you** (at most 7 obligations, each with its why-it-matters sentence and a one-tap resolve), a Money health tile, a Mission health tile, and My day. Organization Health shows seven status rows, each with a composed cause sentence, entitlement-filtered. `/admin` sends signed-in users to Today and keeps showing the login screen to everyone else. `/admin/queue` and `/admin/briefing` 308 to Today, permanently. Every June `notifications.url` keeps resolving.

## Scope

**In.**
- The Today screen at `/admin/today`: orientation line, Needs-you obligation feed (Contract 3 read), Money health tile, Mission health tile, My day.
- The Organization Health screen at `/admin/organization-health`: seven computed rows with cause sentences, entitlement-filtered.
- The ranking rule for Needs-you (the flood guard — AA has 103 open obligations; the screen shows ≤7).
- The Home cutover: activating the map rows, flipping the tab slot, shrinking the seatless set, the `/admin` auth-door change.
- Resolve/snooze from Today via the A3 RPCs.

**Out.**
- Inbox (its own destination spec; the "graduates into Today" rule ships there).
- Fundraising → Today (Fundraising's spec).
- The Recent-movement feed (recon marks it UNBOUND as a feed — open decision 2).
- Saved views, the Reed panel's contents, onboarding.
- QuickBooks integration (the Money tile launches in the "stale, shown but flagged" state the Stage 5 ruling confirms as the honest default — recon §G).
- Any change to the five V1 surfaces' code (they keep working; two of their routes redirect).

## Architecture

### Today's panels and their sources (recon §G, all landed)

| Panel | Source | Status |
|---|---|---|
| Orientation line | briefing engine (`briefings`, `bloomos_briefing_narrative`) — reused, not rebuilt | exists |
| Needs you | `public.v_obligations` (A2) + `resolve_obligation`/`snooze_obligation` (A3); links via `lib/admin/actionQueue.ts`'s source→route table, already piped through `v2Href` (B2) | exists |
| why_it_matters | the A1 column — sparsely populated on pre-contract rows; render the sentence when present, an honest type-specific line when not ("Filed under compliance, due Sep 12"), never a bare checkbox | exists, sparse |
| Money health | `getFinanceSnapshot()` (the canonical loader, A4) + `fin_config.updated_at` freshness — launches "stale, flagged" | exists |
| Mission health | the Metric primitive (A5) over the A6-seeded keys (`attendance_rate`, `enrolled_in_cohort` computed; the platform metrics manual) — conflict/stale flags render inline by contract | exists |
| My day | `calendar_events` (Google sync) + approvals (`reed_drafts`) | exists |

**The ranking rule (pure, tested):** overdue first (most overdue at top), then due today, then undated by source weight (`ops_task` and `grant_requirement` over derived arms), capped at 7. `metric_stale` rows already require an owner (A2's flood guard — 20 rows, not 67). One obligation per `id`; the Kapor-style dedup is A2's job, already proven in prod.

### Organization Health's seven rows

money (`getFinanceSnapshot`), fundraising (`gifts` + `opportunities` vs. goal), programs (`attendance` via the house rollup math), team execution (`ops_tasks` weekly counts), strategy (`plan_objectives` + `plan_reviews`), governance (`board_members` + `compliance_items`), data freshness (the `metric_stale` logic). Each row = status + a **composed** cause sentence (deterministic code, not LLM — open decision 3). Rows are entitlement-gated individually: the 9-key orgs render 5 of 7 (no strategy, no team). Every number on both screens renders through `<Metric>` or a canonical loader — Contract 2's teeth apply from day one, and the render-refusal chip appearing on a screen is the contract working, not a bug.

### The cutover (Spec B's machinery, first use)

1. Both screens exist → the two entries leave the pinned seatless set (`tests/v2-shell.test.ts`, the list that only shrinks).
2. `"home"` joins `V2_CUTOVER_DESTINATIONS` → Home's tab slot flips from the V1 SectionSubNav fallback to the V2 single row (Today · Organization Health).
3. Map rows activate: `/admin/queue` and `/admin/briefing` move from AT_CUTOVER to ACTIVE (targets `/admin/today`) in `lib/admin/v2routes.ts` **and** `next.config.mjs` (the row-for-row agreement test enforces both).
4. **`/admin` is the exception** — it hosts the signed-out login UI, and `next.config` redirects can't branch on auth. `/admin` does NOT get a config 308: the page itself sends authed users to `/admin/today` (server-side `redirect()` after the existing auth check) and renders the login screen otherwise. The map row stays honest with a note; `v2Href("/admin")` continues returning `/admin` (links to "home" go to the auth door, which forwards).
5. The V1 cockpit/queue/briefing code is not deleted (queue/briefing pages become unreachable behind their 308s; the cockpit page becomes the auth door). The preservation ledger rows stay bound — the briefing store now feeds Today's orientation line.

## Staged build order

**H1 — Today.** The screen at `/admin/today`: the four exist-today panels (orientation, Needs you with ranking + resolve/snooze, Money tile, Mission tile, My day). Pure ranking function with fixture tests; screen reachable by URL only (no cutover, no redirects, sidebar still links `/admin`). Commit: `spec-home: today screen`.

**H2 — Organization Health.** The screen at `/admin/organization-health`: seven rows, composed causes, per-row entitlement gating, `<Metric>`-rendered numbers. Commit: `spec-home: organization health`.

**H3 — cutover.** Steps 1–5 above, plus verification: the four-org resolved-nav printout showing Home landing `/admin/today`, a live crawl of `/admin/queue` and `/admin/briefing` 308s, the `/admin` auth-door behavior both ways, and the June `notifications.url` shapes re-checked. Commit: `spec-home: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. Signed in as each of the four orgs, Home lands on `/admin/today`; Needs-you shows at most 7 rows, each with a why-it-matters sentence or the honest fallback line — never a bare number, never a bare checkbox.
2. Resolving an obligation from Today (via the A3 RPC) removes it from Today, `/admin/ops`'s list, and Reed's queue tool — one write, every surface (Spec A DoD #1, now exercised from a screen).
3. Organization Health renders 7 rows for AA/YGB and exactly 5 for the 9-key orgs, each with a cause sentence.
4. `/admin` sends an authed user to Today and shows an unauthed user the login screen, byte-for-byte the login they see today.
5. `/admin/queue` and `/admin/briefing` return 308 to `/admin/today`; every stored `notifications.url` shape still resolves; the redirect crawl and config↔map tests stay green.
6. The Money tile shows the freshness state honestly ("stale, flagged" until a fresher anchor lands) rather than pretending to be live.
7. With the V2 flag off, everything except the two 308s and the `/admin` forward is byte-for-byte V1 (the flag governs chrome; the cutover governs routes — both stated, neither hidden).

## Failure modes

**The flood.** AA has 103 open obligations; without the cap and ranking, Today becomes the queue with a new name. The cap is 7, the rule is pure and tested, and "View all" is open decision 1 — not silently re-inventing `/admin/queue`.

**why_it_matters is mostly NULL.** Pre-contract rows never had the column. The fallback line must be honest and type-specific, and backfilling is write-path work (A3's `upsert_obligation` sets it going forward) — not a Today blocker.

**The `/admin` auth door breaks login.** The riskiest edit in the spec touches the one page every user hits signed-out. The change is additive (a `redirect()` above the existing render path), and DoD 4 tests both directions before cutover ships.

**Health rows lie by composition.** A cause sentence composed from a stale source reads as authority. Every row carries the same freshness honesty as the Money tile; the data-freshness row exists precisely to flag the others.

**Redirect loop.** `/admin/today` must never redirect anywhere (it's an ACTIVE target; the fixed-point test covers it the moment the rows activate).

## Open decisions — all resolved (Remi, 2026-09-08, as recommended)

1. **View all — RESOLVED: expand-in-place.** A "show all N" toggle on Needs-you; no new screen; `/admin/queue` 308s to `/admin/today` at cutover.
2. **Recent movement — RESOLVED: deferred.** Today ships without it; it becomes its own stage when a destination needs the feed.
3. **Cause sentences — RESOLVED: composed.** Deterministic code — same input, same sentence, testable. Reed can narrate on top later.

---

*Spec approved 2026-09-08. H1 kicked off the same day.*
