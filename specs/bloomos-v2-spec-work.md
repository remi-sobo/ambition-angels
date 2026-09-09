# Spec Work — the fourth destination: Plan & Close + My Week + Tasks + Projects + Meetings + Documents

The fourth destination cutover, and the first with six tabs. Four of them are already living at their V2 paths — the work is one genuinely new screen (the merged ritual), one absorption (the week grid), and honoring a signed ruling (the connection candidates' home).
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§F.1, §G), `docs/v2-preservation-ledger.md` (R2 addendum — `connection_candidates` bound to Work → Meetings, SIGNED 2026-09-03), Spec A (Contract 3 — its `v_obligations` ruling on `connection_candidates` is cited here, not reopened), Spec B (all merged), Spec Home, Spec Fundraising, Spec Finance (all merged; three destinations live).

---

## Problem statement

Work is the ops_tasks product plus everything that shapes a week: the Monday and Friday rituals, the week grid, tasks, projects, meetings, documents. V1 spreads it across `/admin/ops/*`, `/admin/calendar`, `/admin/meetings/*`, and `/admin/documents`. The V2 model (B1) says six tabs — Plan & Close · My Week · Tasks · Projects · Meetings · Documents — and four of them (Tasks, Projects, Meetings, Documents) have hosted their V1 screens at V2 paths since B2, with their V1 routes already 308ing. What's missing is the model's landing tab itself: **Plan & Close**, the one screen the recon marks "merged" — today it is two routes, `/admin/ops/monday` and `/admin/ops/friday`, one ritual each, with `/admin/ops/my-week` as a doors page routing between them. And **My Week** is that doors page, when the Handoff Spec says it is the week grid (`/admin/calendar` folds in; Stage 0 kept them separate, the Handoff Spec is authoritative). This spec builds the ritual screen, moves the grid, and cuts the destination over.

## Who's affected

The tab row is the most entitlement-varied yet: `modules.ops` gates Plan & Close, Tasks, Projects; `modules.meetings` gates My Week and Meetings (the week grid pairs with the Google calendar connection — the nav model's own note); `modules.documents` gates Documents. AA and YGB hold all three → six tabs. The 9-key orgs (Young Life EPA, SafeSpace) lack `modules.meetings` → four tabs (Plan & Close · Tasks · Projects · Documents). Everyone lands on Plan & Close, which today resolves to its first live source, `/admin/ops/monday`. Remi's daily rhythm lives here; the rituals must survive the move exactly.

## Current behavior

`/admin/ops` 308s to `/admin/work/tasks`; `/admin/ops/my-week`, `/admin/ops/projects/*`, `/admin/meetings` (+uuid children, +upcoming), and `/admin/documents/*` likewise 308 to their `/admin/work/*` hosts, which re-export the V1 pages unmodified (B2 hosts). `/admin/ops/monday` and `/admin/ops/friday` render the two ritual wizards (RhythmWizard + the Monday orient/walk/commit and Friday orient/close/recap/nudge steps over `rhythm_sessions` + `ops_tasks`). `/admin/work/my-week` re-exports the doors page: `WeekStatusLine` + two time-lit doors linking the ritual routes (`rhythmModeForToday()` decides which is "Now"). `/admin/calendar` is the week grid (`getWeekView` over `calendar_events` + `work_blocks`; `?week=` and `?owner=` ride the URL, other owners read-only). `/admin/meetings/connections` is the get-a-meeting-booked pipeline: the email-detected `connection_candidates` queue (suggest-then-confirm), the manual entry form, and the scheduling-task backlog. `/admin/meetings/booking-page` is setup for the public `/meet` scheduler. `/admin/briefing/weekly` is the AI-narrated weekly briefing — NO V2 HOME in the recon. The Work tab slot renders the V1 SectionSubNav (pre-cutover fallback).

## Desired behavior

Plan & Close is one screen at `/admin/work/plan-close` hosting both rituals — the time-appropriate one open by default, the other a click away — with the Monday and Friday flows moved verbatim. My Week is the week grid at `/admin/work/my-week`: the grid, the week status line, and one door to the lit ritual. Meetings absorbs the connections pipeline (R2's binding honored: the candidates' V2 home is Work → Meetings). At cutover `"work"` joins `V2_CUTOVER_DESTINATIONS`, the four remaining moves 308, and no ritual, grid, or candidate is a step further away than it was.

## Scope

**In.**
- Plan & Close at `/admin/work/plan-close`: Monday's plan flow and Friday's close flow absorbed onto one screen (the F2–N3 extraction pattern; V1 routes byte-identical until their 308s), default ritual by `rhythmModeForToday()`, URL override per decision 1.
- My Week recomposed at `/admin/work/my-week`: the `/admin/calendar` grid absorbed (extraction; `?week=`/`?owner=` semantics preserved), `WeekStatusLine` kept, the two doors collapsed to one link into Plan & Close.
- Meetings absorbing the connections pipeline (candidates queue + new-connection form + scheduling backlog) per decision 3.
- The Work cutover: `ops/monday`, `ops/friday`, `calendar` (and `meetings/connections` per decision 3) activate; tab slot flips; config↔map agreement.

**Out.**
- The Tasks redesign — the size/estimate column and the template store are the recon's two UNBOUND-additive notes (decision 2, recommended deferred). Tasks keeps hosting the V1 screen, as Grants and Campaigns did in Fundraising.
- Projects and Documents rebuilds — live at their V2 paths already; restructure in a later pass if ever.
- `/admin/meetings/booking-page` — genuinely settings-shaped (public `/meet` setup); stays at-cutover with a null target, live and unlisted, until a Settings destination exists.
- `/admin/briefing/weekly` — NO V2 HOME stands (decision 4).
- Any change to `v_obligations` — Contract 3's arms are frozen this spec; Spec A's ruling that `connection_candidates` is EXCLUDED on purpose (it carries `ops_task_id` and already promotes into tasks — an arm would double-count) is cited, not reopened. The preservation ledger's "Contract 3 must rule explicitly" note is thereby satisfied: it ruled, in `spec_a_v_obligations.sql`'s view comment.
- Google/Gmail account connection settings, `calendar_prefs`, working hours — untouched.

## Architecture

### The screens and their sources (recon §G)

| Screen | Source | Status |
|---|---|---|
| Plan & Close | `rhythm_sessions` (ritual state), `ops_tasks` (carryover, day board, truthing), `work_blocks` + `calendar_events` (load-per-day), `meeting_suggested_tasks` (Friday recap) | exists across two routes — the merge is the build |
| My Week | `getWeekView`: `calendar_events`, `work_blocks`, `work_block_tasks`, `calendar_prefs`; status from `lib/admin/ops/rhythm` + `statusLine` | grid shipped (PR #451) at `/admin/calendar`; the move is the build |
| Tasks | `ops_tasks` (labels, priority, subtasks, carry, planned week/day) | live at V2 path; size/estimate + templates **UNBOUND-additive** — decision 2 |
| Projects | `ops_projects` + task rollups; objective link via `initiative_id → plan_initiatives → plan_objectives` | live at V2 path, kept |
| Meetings | `meeting_records`, `meeting_suggested_tasks`, `calendar_events`; + `connection_candidates` and the `SCHEDULING_LABEL` `ops_tasks` backlog per decision 3 | live at V2 path; absorption per decision 3 |
| Documents | `documents`, `document_links` | live at V2 path, kept |

No new tables, no migrations, no new numbers: the ritual screens render task counts and load, not metrics — Contract 2 is not newly exercised here, and nothing touches the ledger.

### The ritual merge (the one new screen)

`/admin/ops/monday` (404 lines) and `/admin/ops/friday` (409 lines) become `PlanSection.tsx` and `CloseSection.tsx` (extraction: page bodies move whole, V1 routes become thin stubs rendering them unmodified — the structural pin tests enforce it). `/admin/work/plan-close` composes both behind a ritual switch: `rhythmModeForToday()` picks the default (Mon–Wed → Plan, Thu–Sun → Close, exactly the doors page's logic), the other ritual one click away. The doors page's insight — "the time-appropriate one is emphasized, the other stays open" — survives as the switch's default, not as a separate hub screen.

### The cutover (fifth use of Spec B's machinery)

Rows activating: `/admin/ops/monday` → plan-close (exact), `/admin/ops/friday` → plan-close (exact), `/admin/calendar` → my-week (exact — no children exist), and per decision 3 `/admin/meetings/connections` → `/admin/work/meetings` (disposition changes settings → merged; exact — it has no child routes). `/admin/meetings/booking-page` keeps its null-target at-cutover shape. `/admin/briefing/weekly`'s NO_HOME row stays. `"work"` joins `V2_CUTOVER_DESTINATIONS`. No same-path rows this time — every move is a real 308, and `?week=`/`?owner=` must survive the calendar hop (the grid is linkable; the crawl proves it).

## Staged build order

**W1 — Plan & Close.** The merged ritual screen (extraction pattern; V1 routes byte-identical). `liveSeatFor("/admin/work/plan-close")` starts resolving to itself the moment its map rows activate — which is W4, not W1: until cutover the seat keeps resolving to `/admin/ops/monday` and the new page is reachable but unlinked, the same dark-launch shape every destination used. Commit: `spec-work: plan-close`.

**W2 — My Week.** The week grid absorbed onto `/admin/work/my-week` (which stops re-exporting the doors page): status line, one ritual door, the grid with `?week=`/`?owner=` intact. `/admin/calendar` stays byte-identical until W4. Commit: `spec-work: my-week`.

**W3 — Meetings.** The connections pipeline absorbed onto `/admin/work/meetings` per decision 3 (extraction; candidates queue + form + backlog as a section under the existing upcoming/past lists). Commit: `spec-work: meetings`.

**W4 — cutover.** Rows activate in map + config (matching order), `"work"` joins the cutover set, verification: four-org printout (AA/YGB six tabs, 9-key four tabs, everyone landing Plan & Close), live crawl (308s, query survival on the calendar move), booking-page and briefing/weekly still live and unlisted. Commit: `spec-work: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As AA or YGB, Work renders six tabs; as a 9-key org, four (Plan & Close · Tasks · Projects · Documents) — and every org lands on Plan & Close.
2. Both rituals run end-to-end on Plan & Close exactly as they ran on their V1 routes — same wizard steps, same `rhythm_sessions` writes, same task actions. The extraction pattern's pin tests prove the bodies moved rather than being reimplemented.
3. My Week shows the week grid; `/admin/calendar?week=2026-09-07&owner=<uuid>` 308s with both params surviving, and the read-only other-owner view still works at the new path.
4. Meetings shows the candidates queue and scheduling backlog; confirming a candidate still promotes it the same way (same API routes, untouched).
5. `connection_candidates` still has no `v_obligations` arm — a scratch read of the view's arms lists ten, unchanged.
6. `/admin/meetings/booking-page` and `/admin/briefing/weekly` stay live, unlisted, un-redirected.
7. With the V2 flag off, everything except the new 308s is byte-for-byte V1.

## Failure modes

**The ritual drifts in translation.** The Monday and Friday flows are Remi's practice, not just screens. The extraction pattern exists so the logic travels as-is; a reimplemented wizard that writes `rhythm_sessions` slightly differently corrupts the week-status reads everywhere they appear (Home's briefing included).

**The wrong ritual greets the day.** `rhythmModeForToday()` already encodes the week's shape; the merged screen must use it for the default, not a hardcoded tab order — a Friday that opens on Plan is a regression the doors page never had.

**The grid loses its links.** `?week=` and `?owner=` are what make the calendar shareable and the back button work. A cutover that drops the query on the 308, or a recomposed grid that pins pills to the old basePath, breaks every stored link at once.

**Candidates double-surface.** Absorbing the connections queue onto Meetings must not tempt a `v_obligations` arm "while we're in there" — Spec A ruled, the promote-into-tasks path already feeds the queue, and an arm would show the same item twice on Today.

**The 9-key row dead-links.** My Week and Meetings vanish for orgs without `modules.meetings` by the entitlement rule — the cutover printout must show four tabs, not six with two dead.

## Open decisions — all four resolved (Remi, 2026-09-09, as recommended)

1. **Plan & Close's switch — RESOLVED: URL-driven.** `?ritual=plan|close`, linkable and refresh-safe; default (no param) follows `rhythmModeForToday()`.

2. **Tasks' two UNBOUND-additives — RESOLVED: both deferred.** The size/estimate column and the template store each become their own stage when a real need lands (the scenarios precedent from Finance). Tasks keeps hosting the V1 screen.

3. **The connections pipeline's home — RESOLVED: Meetings.** Absorbed at W3, row activates at W4 (disposition settings → merged); `booking-page` alone stays settings.

4. **The weekly briefing — RESOLVED: stays put.** Live, unlisted, un-redirected; NO V2 HOME stands until the briefing product gets its own look.

---

*Spec approved 2026-09-09. W1 kicked off the same day.*
