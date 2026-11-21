# V4 Phase 0, track 0: harness and capture

**Finding first:** under made-up data, 92 of 95 captured admin routes render real, populated UI at desktop and phone. Three detail screens crash for every record of their kind (a real bug class, not a mock artifact). No role is hidden or blocked from any destination by the app shell. Five nav tabs overflow the phone viewport.

Evidence lives in `/tmp/claude-0/-home-user/37ef0b96-8c34-5029-86f7-ad0676415d24/scratchpad/v4-shots/<run>/` (JPEGs, `manifest.json`, `sheets/` contact sheets). Harness: `e2e/v4/` (see its README).

## What the harness covers

- `mock-supabase.mjs`: GoTrue (password token, user, logout) and PostgREST on 127.0.0.1:55321. Filters eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs/cd/ov/not and nested `or()`/`and()`, JSON-path filters, order with nulls, limit/offset/Range, `Prefer: count=exact` with Content-Range, HEAD counts, single-object Accept (406 PGRST116 on 0 or many rows), embedded selects resolved through real foreign keys (aliases, `!hint`, `!inner`, spreads, `(count)`), RPCs with per-name fixtures, writes that echo the body with an id. Runtime switches: profile, role, read delay, forced read or write 500s. Logs: tables and RPCs with no fixture, selects seen, every write body.
- Schema truth: column sets, foreign keys and check-constraint enums are dumped from the repo's own migrations into a throwaway local Postgres (`dump-schema.sh`). The SQL views (`v_obligations`, `v_action_items`, `v_revenue_schedule`, `v_fr_rollups`, `ms_catalog`) are computed by loading the fixtures into that Postgres and selecting from the real view definitions (`fixtures/compute-views.mjs`). Loading also validates every fixture row against real constraints.
- Fixtures: one invented org, "Ambition Angels (demo)", 5 invented staff and board people, 150 constituents, 460 gifts, 24 pledges, 18 grants, 36 opportunities, 26 asks, 7 email campaigns with 222 sends, 62 tasks, 10 projects, 84 students, 6 cohorts, 690 attendance rows, 22 partners, 310 bank transactions, budget, 4 objectives with goals and KPIs, 9 board members, 12 compliance items, 24 notifications, 4 message threads. Profiles: `populated`, `empty`; roles owner, admin, staff, finance, board_viewer. No real names, amounts or ids.

## Runs (verified)

| Run | Shots | Result |
|---|---|---|
| populated-owner (all routes, desktop + phone) | 184 | 178 ok, 4 error boundary, 2 intentional 404 |
| empty-owner (nav, desktop + phone) | 76 | 76 ok, empty states render |
| populated-board_viewer / staff / finance (nav, desktop) | 38 each | all ok |
| special states | 14 | see below |
| addendum: soft-credit donor, phone overflow sweep | 1 + 38 | 1 error boundary; 5 overflow |

## Broken routes

1. **Compliance item detail** `/admin/organization/compliance/[id]`: error boundary for every item. `Cannot access form_990.toString on the server. You cannot dot into a client module from a server component.` The server page reads `KIND_LABELS` from the `"use client"` file `app/admin/compliance/_components/ComplianceControls.tsx`. Real bug, verified (code and runtime).
2. **Board member detail** `/admin/organization/board/[id]`: same class. `ROLE_LABELS` imported from `"use client"` `app/admin/board/[id]/_components/MemberProfileControls.tsx`. Real bug, verified.
3. **Donor 360 for any donor with a soft-credited gift** `/admin/fundraising/donors-funders/[id]`: same class, `SC_TYPE_LABEL` from `"use client"` `SoftCreditControls.tsx` (`Cannot access household.toString`). Donors without soft credits render. Real bug, verified. A scan of `app/admin` found no other server file importing constants from a client module.
4. **Unknown admin URLs return HTTP 200** with the in-shell 404 screen (soft 404). Verified on the dev server; likely the same in production because `app/admin/loading.tsx` streams the shell before `notFound()` runs (assumption).
5. **Failed task completion is silent.** With the mock returning 500 on `ops_tasks` writes, ticking "Mark as done" in Work / Tasks shows no toast and no error; `patchStatus` in `app/admin/ops/_components/TaskListView.tsx` never checks `r.ok`. Real bug, verified. The edit modal handles the same failure correctly (inline "Failed to update task").
6. **A failed read on Donor 360 renders "There's no page here"** instead of an error. Verified under forced 500s; real behavior (the page treats a read error as a missing record), exact production frequency needs runtime access.

Not bugs: `/admin/fundraising/pipeline/[id]` takes an ask id, `/admin/work/meetings/upcoming/[id]` a calendar event id (first attempts 404'd from wrong ids). The task modal has no URL; it is captured as a click state.

## Roles (verified under mock, see limits)

- The shell builds navigation from entitlements only. Board viewer, staff and finance get the same seven destinations, every tab, and the same page content as the owner. No route showed a permission panel, redirect or module gate for any role. Only Strategy differs (owner edit controls).
- Board viewer sees the full donor list with lifetime giving, Finance, Team, Compliance and Messages. Under the mock this is expected (no RLS). In production, session-client reads would be filtered by RLS, but 39 admin page files read through the service-role client, which bypasses RLS. Which of those leak to board_viewer needs track 3 code review plus runtime access.
- Strategy narrative (`/admin/strategic-plan/narrative`) falls back to Ambition Angels' real proof points (3,500+, 87%, 1,100+, 14%) for any org without its own (`MovementPlan.tsx` `FALLBACK_PROOF`). Tenant-content leak, verified.

## Special states (verified)

Mobile More sheet, mobile quick actions, desktop quick add, global search with "Harbor" (desktop and phone), Reed panel, task edit modal, loading skeletons (Fundraising, Programs; client navigation with a 12s mock delay), failed save (silent on tick, inline on modal), all data reads 500 on Today, Fundraising Today (both degrade to zeros and dashes without saying data failed to load) and Donor 360 (404 screen). The phone loading capture did not work (bar link not clickable during the test); not retried.

## Mobile overflow (verified, phone 390px)

Page wider than the screen, so the browser zooms out: Work / Tasks (+375px), Organization / Strategy (+188px), Donors & Funders (+150px), Impact / KPIs (+78px), Finance / Transactions (+44px).

## Mock limits: what this evidence cannot prove

- No RLS, no triggers, no realtime (websocket 404 console errors on every page are mock artifacts), no storage (document downloads), no Google, Gmail, HubSpot, Stripe or Anthropic. Reed, Capture, Comms sending and calendar sync show their unconnected states only.
- Writes are discarded by default, so flows that save then reread show the old row.
- Views are a snapshot computed on 2026-11-20; "due today" rows drift a day per day until `compute-views.mjs` is re-run.
- Load times are dev-server compile times, not production performance.
- Role findings show app-layer behavior only. Anything about live RLS, backups, monitoring or slow queries needs runtime access.

## Tables requested with no fixture (populated profile)

Left empty on purpose or long tail: `org_terminology` (AA has zero rows by design), `audit_log`, `bloomos_briefing_narrative`, `bloomos_briefing_state`, `briefings`, `reed_drafts`, `reed_threads`, `reed_suggestions`, `reed_next_moves`, `reed_plan_proposals`, `ai_calls`, `stewardship_rules`, `rhythm_sessions`, `work_blocks`, `work_block_tasks`, `calendar_sync_jobs`, `calendar_prefs`, `connections`, `agenda_delegations`, `meeting_exclusions`, `ask_documents`, `document_links`, `custom_field_defs`, `hs_sync_jobs`, `hs_deals`, `hs_contacts`, `gmail_sync_jobs`, `fr_nba_suggestions`, `fr_gift_tables`, `fr_gift_table_levels`, `fr_gift_table_placements`, `fin_imports`, `imports`, `strategy_angles`, `funder_angles`, `strategy_room_meta`, `invitations`, `coach_sessions`, `game_pool`, `game_daily`, `demoday_notes`, `ygb_registrations`, `quiz_submissions`, `donations`, `partner_waitlist`, `program_partners`, `blackouts`, `plan_objective_notes`, `review_competencies`, `review_feedback`, `review_summaries`, `v_review_feedback_visible`, `journey_enrollments`, `relationships`, `entity_comments`, `email_link_clicks`. Visible effect: empty gift tables, Weekly Briefing, Demo Day, YGB, Play Pool, Daily Calendar, Strategy angles and review forms show empty states. No RPC was requested without a handler.
