# Spec Programs — the fifth destination: Overview + People + Intake + Cohorts + Attendance + Partners + Content

The fifth destination cutover, and the widest tab row (seven for AA). Most seats have hosted their V1 screens since B2 — the work is the one seatless screen (Attendance), a landing page that today is a placeholder (Overview), one mistargeted merge to re-aim (volunteers), and a cutover that deliberately leaves the two pinned-view questions for October.
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§C, §F.1, §G), `docs/v2-preservation-ledger.md` (R8, R9 — both SIGNED "pinned Group view, no front door, revisit October"; the volunteers row), Spec B (all merged), Spec Home, Spec Fundraising (the R11 views machinery this spec extends), Spec Finance, Spec Work (all merged; four destinations live).

---

## Problem statement

Programs is the mission itself — teens, cohorts, sessions, partners, the career library — and V2's model gives it the widest row: Overview · People · Intake · Cohorts · Attendance · Partners · Content. Five of those seats already host live V1 screens (People/Intake/Cohorts/Partners/Content re-exported since B2, their V1 routes 308ing). What's missing is different in kind from the last three specs: **Attendance** is the model's one seatless tab (the pin test names it) — attendance exists only inside each session's sheet at `cohorts/[id]/sessions/[sessionId]`, with no cross-cohort surface; and **Overview**, the destination's landing tab, renders a nine-line placeholder ("Partners, teens, outcomes.") — the only V2 landing that would greet every org with an empty page. This spec builds both, re-aims the volunteers merge at the table volunteers actually live in, and cuts the destination over.

## Who's affected

All four orgs hold `modules.program`, so everyone gets Overview · People · Intake · Cohorts · Attendance; everyone also holds `modules.partners` (+ Partners). Only AA holds `modules.content` (+ Content) — AA renders seven tabs, YGB and the 9-key orgs six. Everyone lands on Overview, which is precisely why it cannot stay a placeholder. The program staff running sessions are Attendance's users; Shannon and Remi read Overview.

## Current behavior

`/admin/students`, `/admin/intake`, `/admin/cohorts`, `/admin/program`, `/admin/partners`, `/admin/careers` all 308 to their `/admin/programs/*` hosts (B2 hosts, pure re-exports). Attendance is taken per session inside the cohort detail (the `AttendanceSheet` at `cohorts/[id]/sessions/[sessionId]`, seated under the cohorts prefix). `/admin/program` — and therefore Programs → Overview — is a `PageHeader` and nothing else. `/admin/fundraising/volunteers` lists constituents flagged `is_volunteer` (relabeled per `org_terminology` — YL EPA reads "Leaders"), and its at-cutover row targets Programs → People. `/admin/demoday` is live with its own screen (R8: pinned Group view on Cohorts, mechanism undesigned, October revisit); the YGB camp surfaces are the same shape (R9). `/admin/careers/daily` and `/admin/careers/pool` are NO_HOME rows — but the careers page (Content's host) already links both from its own body. The Programs tab slot renders the V1 SectionSubNav.

## Desired behavior

Attendance is one screen: today's and upcoming sessions across every cohort, each row carrying its attendance state and opening the existing sheet — no new write path, the sheet keeps owning writes. Overview earns the landing: the near-term session schedule and the needs-attention list, built only from bound data. Volunteers become a built-in view of Donors & Funders — the one-list rule applied to the table they already live in. At cutover `"programs"` joins `V2_CUTOVER_DESTINATIONS`; Demo Day and YGB camp deliberately do not move (R8/R9 stand until October).

## Scope

**In.**
- The Attendance screen at `/admin/programs/attendance`: sessions across cohorts from `cohort_sessions` + `attendance` rollups (taken/expected per session), grouped today → upcoming → recent, each opening its session sheet at the seat it already has. A `KEPT_IN_PLACE` entry seats the tab (the organization-health precedent: a V2-only screen whose own path is the seat).
- The Overview build at `/admin/programs/overview` (the host stops re-exporting): next sessions (`cohort_sessions`), needs-attention rows from bound data only — attendance drops (`attendance`), missing guardian (`students.custom_fields`), intake waiting (`applications`/`participant_stages`). The V1 `/admin/program` placeholder stays byte-identical behind its existing 308.
- The volunteers view: `"volunteers"` joins `BuiltInView` (`lib/fundraising/views.ts`, the R11 machinery) over `constituents.is_volunteer`, terminology-relabeled as today; the at-cutover row re-targets per decision 1. The V1 list stays byte-identical until its 308.
- The Programs cutover: the volunteers row activates, tab slot flips, config↔map agreement.

**Out.**
- The §C participant-spine backfill (`students.constituent_id` bridge + `v_people`) — the recon's own "judgment call" on ~70–150 new constituents rows and dedup against 3,631. People keeps reading `students`; the backfill is Contract 4's own future spec, not a rider on a cutover.
- The FY26 funnel on Overview (signed up → started → mid-track → finished) — UNBOUND platform-app data; manual `metric_snapshots` today. Overview ships without it (decision 3).
- The Attendance offline queue — Stage 5 designs it as a client-side build; deferred (decision 2).
- Demo Day and YGB camp pinned Group views — R8/R9 rule them "mechanism undesigned, revisit October with real data." Their rows stay at-cutover, their screens stay live (decision 4).
- People saved views over track/day (partially UNBOUND platform fields) and the guide column (no guide table) — People keeps hosting the V1 list.
- `/admin/careers/daily` and `/admin/careers/pool` — NO_HOME stands; Content's own body already links both, so they stay reachable post-cutover with no build (the rows' notes say so).
- Intake rework — `applications` has 0 rows; the V1 screen keeps its seat until intake actually writes.
- HubSpot, imports, any schema change: **this spec ships no migrations.**

## Architecture

### The screens and their sources (recon §G)

| Screen | Source | Status |
|---|---|---|
| Overview | `cohort_sessions` (next sessions) + `attendance` (drops) + `students.custom_fields` (guardian) + `applications`/`participant_stages` (waiting) | placeholder today — the build; funnel **UNBOUND**, out |
| People | `students` (70) | live host, kept; views/guide UNBOUND, out |
| Intake | `applications` + `participant_stages` | live host, kept (0 rows — waits on real intake) |
| Cohorts | `cohorts`, `cohort_members`, `cohort_sessions`, `attendance` rollups | live host, kept |
| Attendance | `cohort_sessions` + `attendance`; the sheet at `cohorts/[id]/sessions/[sessionId]` keeps owning writes | **the seatless screen — the build** |
| Partners | `partners`, `partner_contacts`, `partner_interactions`, MOU columns | live host, kept |
| Content | `ms_occupations`, `ms_cards`, the `/admin/careers` queue (links daily/pool itself) | live host, kept |
| Volunteers view | `constituents.is_volunteer` via the R11 views machinery | decision 1 |

Every number renders through `<Metric>` or a canonical loader (Contract 2); Attendance rollups are counts over `attendance`, not new stores.

### The volunteers re-aim (decision 1)

Stage 0 mapped `/admin/fundraising/volunteers` → Programs → People, "volunteer view." But People runs on `students`, and volunteers are **constituents** — the V1 page exists precisely because the old donors list was gift-gated, and its comment says volunteers are "constituents wearing a different hat." The V2 Donors & Funders list is not gift-gated and already carries built-in views (R11). The honest merge is a `"volunteers"` view there: one list, both hats, no schema change, terminology intact. The map row re-targets with an as-built note — the F6/N4 narrowing precedent applied to a target instead of a kind.

### The cutover (sixth use of Spec B's machinery)

Rows activating: `/admin/fundraising/volunteers` → its decision-1 target (exact). `/admin/programs/attendance` joins `KEPT_IN_PLACE`. `"programs"` joins `V2_CUTOVER_DESTINATIONS`. Deliberately NOT moving: `/admin/demoday` (R8) and the YGB camp surfaces (R9) stay at-cutover pending October; `careers/daily`/`pool` stay NO_HOME with updated notes. The Overview host stops re-exporting at P2 — like every extraction, `/admin/program` itself stays byte-identical behind its 308.

## Staged build order

**P1 — Attendance.** The cross-cohort session surface + `KEPT_IN_PLACE` seat; the pin test's seatless set shrinks by one. Commit: `spec-programs: attendance`.

**P2 — Overview.** The landing build over bound data; next sessions + needs-attention, no funnel. Commit: `spec-programs: overview`.

**P3 — Volunteers view.** `"volunteers"` in the views machinery + the Donors & Funders wiring per decision 1; V1 list untouched until P4. Commit: `spec-programs: volunteers-view`.

**P4 — cutover.** The volunteers row activates in map + config, `"programs"` joins the cutover set, verification: four-org printout (AA seven tabs, YGB/9-key six, everyone landing Overview), live crawl (the volunteers 308, demoday/daily/pool still live and un-redirected). Commit: `spec-programs: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As AA, Programs renders seven tabs; as YGB or a 9-key org, six — everyone lands on Overview, and Overview shows real rows, not a placeholder.
2. Attendance lists every cohort's sessions with taken/expected counts; opening a session lands on the existing sheet, and taking attendance there is unchanged.
3. `/admin/fundraising/volunteers` 308s to the decision-1 seat showing the same people the V1 list showed, still relabeled per org (YL EPA sees "Leaders").
4. `/admin/demoday`, `/admin/careers/daily`, `/admin/careers/pool` answer exactly as before — live, no 308, reachable (daily/pool via Content's own links).
5. The seatless-set pin shrinks to Impact's two rows only.
6. With the V2 flag off, everything except the new 308 is byte-for-byte V1.
7. No migrations: the ledger check sees nothing from this spec.

## Failure modes

**Attendance grows a write path.** The sheet owns writes; a second "quick mark" write path on the new screen would fork the truth. The screen links, counts, and never writes `attendance`.

**Overview invents numbers.** The funnel is UNBOUND — a landing that fakes it with stale snapshots poisons the destination's first impression. Bound rows only; absent data reads as absent.

**The volunteers view drops the relabel.** YL EPA's "Leaders" comes from `org_terminology`; the view label must ride the same lookup the V1 page used, or a tenant's vocabulary breaks at the 308.

**The pinned-view questions get "solved" in passing.** R8/R9 say the mechanism is undesigned and the data arrives by October. Wiring a quick pinned view now would pre-empt a signed ruling — the rows stay put.

**The wide row wraps.** Seven tabs is the widest yet; the B3 no-wrap pins (flex-nowrap, scroll, shrink-0) must hold at AA's count — the existing structural test covers it, the printout proves it.

## Open decisions (recommendations inline — nothing starts until Remi rules)

1. **Where volunteers land.** The Stage 0 map says Programs → People (volunteer view); the data says volunteers are `constituents` (`is_volunteer`), and Donors & Funders is the one-list with the views machinery. **Recommendation: re-target to Donors & Funders** — `"volunteers"` becomes a built-in view (R11 machinery, no schema change, terminology preserved); the map row's as-built note records the re-aim. People stays a `students` surface.

2. **The Attendance offline queue.** Stage 5 designs offline capture for spotty school Wi-Fi. **Recommendation: defer** — the screen ships online-first (the scenarios/size-column precedent); the queue becomes its own stage when field use demands it.

3. **Overview's funnel.** Signed-up → started → mid-track → finished is platform-app data that only exists as manual `metric_snapshots`. **Recommendation: ship Overview without it** — next sessions + needs-attention from bound data; the funnel arrives with Impact's provenance work, not before.

4. **Demo Day and YGB camp.** R8/R9: pinned Group views on Cohorts, mechanism undesigned, revisit October with real data. **Recommendation: honor the rulings** — both stay at-cutover with live screens; this spec neither designs the pinned-view mechanism nor moves the routes.

---

*Drafted 2026-09-09, pending Remi's approval. P1 begins only on his kickoff.*
