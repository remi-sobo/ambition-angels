# Spec Impact — the sixth destination: Outcomes + KPIs + Analytics + Reports

The sixth destination cutover, and the most honest one: half of what the design wants to show does not exist as data yet. The work is two seatless screens built provenance-first (Outcomes, Reports), one working screen absorbed (the KPI scorecard), and a cutover — with one small additive migration, the first since Spec Finance.
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§F.1, §G), `docs/v2-preservation-ledger.md`, Spec A (Contracts **2** and **7**, the Metric Catalog + `render.ts` provenance flags + `exportGate` — all of Impact runs on A's machinery), Spec Finance N3 (the report-builder pattern this spec generalizes: draft always, flag inline, gate the exit, rid-becomes-document-id), Spec B/Home/Fundraising/Work/Programs (all merged; five destinations live).

---

## Problem statement

Impact is where BloomOS tells outsiders the truth about the mission — and V2's model gives it four tabs: Outcomes · KPIs · Analytics · Reports. KPIs and Analytics have hosted their V1 screens since B2 (the Metric Catalog hub — "the strongest-bound screen in Impact" per the recon — and the AA-only site analytics). Outcomes and Reports are the shell's last two seatless rows, and Outcomes is where the recon is bluntest: day-1/day-30 "can name a career," completion, second-track, guide-who-stayed are ALL unbound — platform-app data that today arrives by hand as `metric_snapshots`. The design's screen is, in the recon's words, "population-and-provenance framing over numbers that today arrive by hand." That is not a blocker; it is the design brief: Contract 2's `<Metric>`/render machinery exists precisely to show a number *with* its provenance — captured when, by hand or by cron, confirmed or in conflict. This spec builds Outcomes as that surface, builds Reports as the second consumer of N3's gated builder, absorbs the KPI scorecard the map already routes here, and cuts the destination over.

## Who's affected

All four orgs hold `modules.metrics` → Outcomes, KPIs, Reports everywhere; only AA holds `aa.site_analytics` → Analytics is AA's fourth tab. Today the shell carries a *stated pre-cutover deviation*: the model lands Impact on Outcomes, but with no screen the 9-key orgs land on KPIs (a pinned test documents it). Building Outcomes retires that deviation — every org lands where the model says. Remi and the board read this destination; funders read what Reports exports.

## Current behavior

`/admin/analytics` and `/admin/kpis` 308 to their `/admin/impact/*` hosts (re-exports). The KPIs host renders the Metric Catalog hub (`getMetricCatalog`: definitions + latest snapshot + freshness + `confirmed_state`, inline update for manual metrics). `/admin/strategic-plan/scorecard` is the owner-segmented KPI working surface over `plan_kpis` + `plan_kpi_snapshots` (values/status/notes edit in place on each card); its at-cutover row targets Impact → KPIs, ruled "merged." Outcomes and Reports render nothing — the tabs are hidden by the seatless rule. Finance → Reports (N3) is live: compose → draft always → flags inline → Contract 7 gates the export → the artifact is a `documents` row carrying its waivers.

## Desired behavior

Outcomes shows the outcome metrics with provenance as the point, not the fine print: value, captured-on, cadence freshness, confirmed/unconfirmed/conflict/stale — rendered through the A-machinery, absent data reading as absent. KPIs absorbs the scorecard so one tab carries both the catalog hub and the owner cards. Reports drafts always and blocks only the exit, exactly like Finance — same gate, same waiver trail, its own artifact type. At cutover `"impact"` joins `V2_CUTOVER_DESTINATIONS`, the scorecard 308s, and the 9-key deviation test is deleted because the deviation no longer exists.

## Scope

**In.**
- The Outcomes screen at `/admin/impact/outcomes`: the outcomes slice of the Metric Catalog (decision 1) rendered provenance-first via `renderMetric`/`<Metric>` — value, captured-on, freshness, `confirmed_state` flag on every number. `KEPT_IN_PLACE` seat (the organization-health precedent). Reads only.
- The Reports builder at `/admin/impact/reports`: the N3 pattern — compose from the catalog, client-minted `rid`, draft renders always with flags inline, export gated by Contract 7 (`export_waivers` artifact_id = the document id), waivers printed into the artifact, Reed narrative via the existing `reed_drafts` kind `report_narrative`. The shared HTML renderer generalizes out of `lib/finance/reportExport.ts` per decision 2.
- The scorecard absorbed onto KPIs (decision 3): `ScorecardSection` extraction, owner cards keep their in-place editing verbatim; `/admin/strategic-plan/scorecard` byte-identical until its 308.
- **One additive migration**: the `impact_report` `entity_types` row (the document spine's registry), applied via the MCP so the ledger stays green. Nothing else touches the schema.
- The Impact cutover: the scorecard row activates, tab slot flips, config↔map agreement, the deviation test retired.

**Out.**
- Binding any outcome metric to platform data — day-1/day-30 prompts, completion, second-track, guide-stayed stay manual `metric_snapshots` until the app exports exist. Outcomes SHOWS that honestly; it never fakes it.
- Analytics rework — the V1 screen keeps its seat (AA-only); app installs / started-track / source attribution are UNBOUND (store exports) and stay out.
- `/admin/fundraising/reports` — NO_HOME stands ("nearest: Impact → Reports or Finance → Reports"); its content migrates when someone asks for it, not by routing.
- Any change to the Finance Reports screen's behavior — decision 2's refactor must leave its exported HTML byte-identical (pinned).
- New metric definitions, targets, or cadences — this spec builds surfaces over the catalog as it stands.

## Architecture

### The screens and their sources (recon §G)

| Screen | Source | Status |
|---|---|---|
| Outcomes | the Metric Catalog (`metric_definitions` + `metric_snapshots`) — outcomes slice per decision 1; provenance via `confirmed_state` + cadence staleness | **seatless — the build**; every underlying number manual today, shown as such |
| KPIs | `getMetricCatalog` (live host) + the scorecard's `plan_kpis`/`plan_kpi_snapshots` owner cards (decision 3) | host live; absorption is the build |
| Analytics | `page_views`/`click_events` (`aa.site_analytics`) | live host, kept |
| Reports | the catalog + `<Metric>` reads; gate `export_waivers`; artifact = `documents` row (`impact_report`); narrative `reed_drafts` (`report_narrative`, exists since N3) | **seatless — the build**, on N3's pattern |

Contract 2 is not a footnote here — it is the product. Every number on every Impact screen renders through the catalog machinery, and Outcomes' whole job is showing what the machinery knows about each number's origin.

### The report builder, second verse (decision 2)

Spec Finance said it: Impact "shares Contract 7's machinery, not this screen." The screen is Impact's own; the machinery generalizes. `renderReportHtml` (+ its line types) moves to `lib/reports/renderHtml.ts`, parameterized where it was fin-flavored; `lib/finance/reportExport.ts` re-imports and re-exports it (the `rhythmMode` split precedent — existing importers untouched, fin output byte-identical, pinned by test). The Impact export route mirrors the fin route: gate → 409 before any write, upload, session-client `documents` insert with `id: rid` and `doc_type: "impact_report"`, storage cleanup on failure, audit `impact.report.export`. `export_waivers.artifact_type` gains no schema change — it's a text column; the new value is `"impact_report"`.

### The cutover (seventh use of Spec B's machinery)

Rows activating: `/admin/strategic-plan/scorecard` → `/admin/impact/kpis` (exact, merged — decision 3). `/admin/impact/outcomes` and `/admin/impact/reports` join `KEPT_IN_PLACE`. `"impact"` joins `V2_CUTOVER_DESTINATIONS`. The pinned 9-key deviation test ("Impact lands on KPIs") is DELETED — with Outcomes built, the model's landing holds for every org, which is the point of building it. The remaining `strategic-plan/*` at-cutover rows (objective, review, setup) are Organization's, not touched here.

## Staged build order

**I1 — Outcomes.** The provenance-first surface + `KEPT_IN_PLACE` seat. Seating the tab changes the landing at once — `resolveShellNav` lands a destination on its first entitled tab *with a live seat*, so every org's Impact points at Outcomes from I1 (dark-launched behind the V1 tab slot until I4), and the 9-key deviation test retires here, not at I4. Commit: `spec-impact: outcomes`.

**I2 — Reports.** The renderer generalization (fin output pinned byte-identical), the Impact builder + gated export route, the `impact_report` entity_types migration (applied via MCP). Commit: `spec-impact: reports`.

**I3 — Scorecard.** `ScorecardSection` extraction onto the KPIs host under the catalog hub; V1 route byte-identical. Commit: `spec-impact: scorecard`.

**I4 — cutover.** The scorecard row activates in map + config, `"impact"` joins the set, the deviation test retires, verification: four-org printout (AA four tabs, everyone else three, everyone landing Outcomes), live crawl (the scorecard 308; analytics/kpis' existing 308s intact). Commit: `spec-impact: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As every org, Impact lands on Outcomes; AA renders four tabs, YGB and the 9-key orgs three. The deviation test is gone because the deviation is gone.
2. Every number on Outcomes shows its provenance: captured-on, freshness for its cadence, and its `confirmed_state` — a conflicted or stale metric is visibly flagged, never silently pretty.
3. An Impact report referencing a `conflict` or `stale` metric drafts and renders with the flag inline, and cannot export without a `reports.approve` waiver; the shipped HTML carries the waiver block; `export_waivers.artifact_id` is the document's id (the rid trick, N3's DoD verbatim).
4. The Finance Reports export is byte-identical before and after the renderer move — a pin test holds the fin route to the shared renderer.
5. `/admin/strategic-plan/scorecard` 308s to KPIs, and the owner cards' in-place editing (value, status, notes) works exactly as it did on the V1 route.
6. With the V2 flag off, everything except the new 308 is byte-for-byte V1.
7. One migration in this spec (`impact_report` entity_types row), applied to prod via the MCP — the ledger check green in both directions.

## Failure modes

**Outcomes fakes a bind.** The temptation is a funnel chart. Every number here is a manual snapshot and the screen must say so — provenance-first is the design, not a disclaimer. Absent data reads as absent.

**The gate blocks drafting.** Contract 7 rule 1, third screen: drafting is never blocked. Flags inline, block on the exit alone — N3's structural pins repeat here.

**The renderer move changes fin output.** A "generalization" that tweaks one `<td>` breaks DoD 4 and silently alters a shipped artifact class. The fin byte-identity pin exists before the Impact route does.

**The scorecard loses its hands.** The owner cards edit in place; an absorption that renders them read-only guts the working surface. The extraction pattern moves the components whole, client islands included.

**Two report screens drift apart.** Same gate, same waiver semantics, same audit shape — only artifact type, title, and metric defaults differ. Shared code is the enforcement, not a style guide.

## Open decisions — all three resolved (Remi, 2026-09-09, as recommended)

1. **What counts as an outcome — RESOLVED: the `program`-department slice.** No schema change; new outcome metrics join by setting their department.

2. **How Reports reuses Finance's builder — RESOLVED: generalize.** `renderReportHtml` + line types move to `lib/reports/renderHtml.ts`, finance re-exports, fin output pinned byte-identical; the Impact route mirrors the fin route's gate-before-write shape with its own artifact type.

3. **The scorecard's landing — RESOLVED: absorbed onto KPIs at I3.** `ScorecardSection` extraction under the catalog hub, editing intact, row activates at I4.

---

*Spec approved 2026-09-09. I1 kicked off the same day.*
