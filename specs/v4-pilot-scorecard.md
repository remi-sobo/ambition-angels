# BloomOS V4 pilot-ready scorecard

Graded 2026-11-21 against `specs/bloomos-v4-product-readiness.md` Section 14, at `main` 47fdc230 (PRs #582 to #611 merged) plus this branch (`claude/v4-p2-pilot-checks`). Everything below that says "test" ran against the mock Supabase (`e2e/v4/`, invented data, two orgs, no real database). How to rerun any of it: `e2e/v4/README.md`, section "Stage P".

Grades: **met**, **partly**, **not met**. Human-only items are listed at the end and are not graded as met until someone does them.

## Summary

| Area | Line | Grade |
|---|---|---|
| Usability | Each Section 9 target demonstrated | partly (5 of 6; find-a-donor is 4 clicks, target 3) |
| Usability | Three new users complete the core flows without help | not met (human sessions not run) |
| Onboarding | New org with 2 operator actions | partly (built in #607; not timed on a real throwaway org) |
| Onboarding | ED finishes the checklist in one sitting; first gift in the first session | not met (needs a real first session) |
| Trust | Zero open P0 or P1 in pilot scope | partly (code items closed; backup restore, two-step login, job schedules open) |
| Trust | Cross-org and role tests pass in CI | partly (they pass; they run locally, not in CI yet) |
| Trust | One restore tested | not met |
| Trust | A failed save is always visible | partly (task, gift, next step, enroll, attendance proven; no app-wide audit) |
| Quality | Smoke flows pass for two orgs, three roles, desktop and phone | met |
| Quality | Visual run has no unexplained diffs | met for the baseline day (first baseline committed here) |
| Quality | Lint rules at zero exceptions | met (#611) |
| Learning | Per org: workflows completed, where setup stalled, errors hit | not met (no reporting or analytics yet; design below) |

## Usability

**Section 9 targets: partly.** `npm run e2e:smoke` (`e2e/v4/smoke/workflows.spec.ts`) drives each workflow through the real UI, counts every click or tap, and asserts the count. 72 runs: 6 workflows x 2 orgs (Ambition Angels (demo), Lanternfield Youth Alliance (demo)) x 3 roles (owner, staff, board viewer) x 2 viewports (1440, 390). All pass. Measured, owner and staff, both orgs:

| Workflow | Target | Desktop 1440 | Phone 390 | Grade |
|---|---|---|---|---|
| Record a gift and thank | 3 clicks or fewer after opening the drawer, gifts editable | 1 (type amount, "Save gift and queue thank-you"); Edit on the timeline reopens the drawer | 1 | met (#598) |
| Find a donor, log the next step | search, record, next-step bar: 3 clicks | 4 to the bar (search, result, "Open full page" from the 360 preview, Change), 5 with Save | 5 to the bar (Look someone up, Search, result, "Open the record", Change), 6 with Save | **not met** |
| Take attendance on a phone | 2 taps to the roster, 1 per exception, offline and says so | staff 1 (Today, "Take attendance"); owner 2 (Attendance, today's session) | same; 1 tap per exception; offline banner shows and the mark waits on the device | met (#603) |
| Enroll a roster in a cohort | under 10 clicks | 3 for 42 people (select all, Enroll in cohort, pick cohort) | 3 (select-all added to the phone list on this branch) | met (#603, this branch) |
| Complete a task | one tap; rolls back and says so | 1; forced failure: toast "Failed to update task", row back to not done | same | met (#592, #594) |
| Story to email to donor record | one flow in Comms; sends and opens on the donor timeline | 4 clicks (story, Use in an edition, Put it here, Make the email draft), every screen under /admin/comms; the donor's timeline shows the sends and opens | same | partly: the flow and the timeline are proven; the send itself goes through Gmail, which the mock cannot do (#604) |

Board viewers: every workflow's entry page shows the not-authorized panel, and the write API refuses (403, or 404 where RLS hides the row first) with nothing written. Asserted in the same suite.

The find-a-donor gap: a person in global search opens the 360 preview first, and the preview has no next-step bar. Either the preview gets the bar (Mark done, Change) or a click on a person opens the record and the preview moves to Tab only. A product call, not made here; the test holds the count at 4 (`KNOWN_GAP` in the spec) so it cannot get worse. On the phone, the lookup card shows the next step read-only; adding Change there would make it 4 taps.

**Three new-user sessions: not met.** Human only. Record-a-gift, find-a-donor and take-attendance, three people who have never used BloomOS, at least 2 of 3 complete each without help.

## Onboarding

**2 operator actions per org: partly.** `scripts/setup-org.ts` and the answers file landed in #607 (Stage F). Not yet timed end to end on a throwaway org against a real Supabase project.

**Checklist in one sitting, first gift in the first session: not met.** The five-step checklist on Home exists (#607; the mock's `fresh` and `halfdone` profiles render it). Needs a real ED's first session.

## Trust

**Zero open P0 or P1: partly.** From the Phase 0 list (`specs/v4-phase0/README.md`): anon RPCs closed (#582), Comms segments fail closed (#583), roles on the server (#593), Ambition Angels-only surfaces fenced (#584), sends as the org (#585), integrations pinned (#587), donor lookup and import org-safe (#587, #589), finance categories per org (#590), the 1,000-row cap (#586), the service worker no longer keeps pages (#588). Still open: #9 backup and restore (human), #10 six unscheduled jobs (a decision per job), D two-step login (#602 not merged; Supabase TOTP settings are human), E Gmail verification (human).

This pass found and fixed, on this branch:
- Board viewers and finance users could open Fundraising pages, Comms Emails, pipeline stage settings and Documents. RLS returned no rows, so the pages were empty, but Record a gift, Add an ask, New campaign, the stage editor and Upload document were on screen (the server refused the writes). Now the not-authorized panel. `app/admin/fundraising/layout.tsx`, `app/admin/fundraising/comms/page.tsx`, `app/admin/fundraising/settings/stages/page.tsx`, `app/admin/documents/page.tsx`, `app/admin/fundraising/donors-funders/[id]/page.tsx`.

**Cross-org and role tests in CI: partly.** `npm run e2e:roles` (`e2e/v4/smoke/routes.spec.ts`) loads all 170 admin routes as owner, staff, finance and board viewer in both orgs (1,368 loads, plus an unknown route and the other org's donor by id in each run). Result: no other-org names anywhere, no crashes, unknown routes are 404 inside the shell, the other org's donor id is a 404, and no unexpected board-viewer write controls. Totals: ok 864, not authorized 370, module off 82 (Ambition Angels-only and Pilot-plan gates), 404 52. Table: `e2e/v4/.logs/roles-table.md` after a run. These run locally against the mock; wiring them into CI needs a job that builds the app and runs `npm run e2e:smoke` and `npm run e2e:roles` (about 25 minutes on 4 cores with `V4_SERVER=start`). The RLS leak test in CI (`rls-test.yml`) remains the database-side half.

Known board-viewer controls still on screen, all refused by the server (listed in `BOARD_VIEWER_ALLOWED`, to fix in a screen pass): board roster and meetings (Add member, New meeting, Mark past, Edit profile), the strategy editors, the KPI "+ add note", "New" message, and the Settings home's Connect Google Calendar, Import a CSV and Sync now.

**One restore tested: not met.** Human.

**A failed save is always visible: partly.** Proven by test for task complete (rollback and toast), and by forced-failure screenshots for task edit (`e2e/v4/special-states.mjs`). Gift, next step, enroll and attendance go through `saveAction` (#594), which toasts on failure. No app-wide audit of the remaining hand-rolled saves; the Phase 0 count of about 36 unchecked saves was worked down in #592 and Stage A to G, not re-counted here.

## Quality

**Smoke flows, two orgs, three roles, desktop and phone: met.** 72 of 72 pass (`npm run e2e:smoke`).

**Visual run: met for the baseline day.** `npm run e2e:visual` (`e2e/v4/visual.mjs`) shoots every nav destination plus Settings and the 404 for owner, staff, finance and board viewer, populated and empty, at desktop and phone, and diffs each first screen against `e2e/v4/baseline/` (200px thumbnails). The first baseline is committed on this branch. Fixture dates move with the day, so a run on a later day shows small diffs; the README says how to read and update.

**Lint rules at zero exceptions: met (#611).**

**Accessibility (Section 12, WCAG 2.2 AA): partly.** `npm run e2e:a11y` runs axe-core with the WCAG 2.0, 2.1 and 2.2 A/AA tags on every route at 1440 and 390 as owner, plus a keyboard pass (Pipeline: Tab reaches a card with visible focus, the card's stage select moves it with the arrow keys; the More actions menu opens with Enter and closes with Escape, focus returns). Fixed on this branch:
- Two nested `main` landmarks on every admin page (`components/SiteChrome.tsx`).
- The search button's name did not contain its visible text (`SearchTrigger.tsx`).
- The sidebar's count badge failed contrast: white on the vivid accent, which the tokens say is fill-only (`SidebarItem.tsx`, now `bg-accent-ink`).
- The phone bar's active label was dark brown on the dark bar (`V2MobileBar.tsx`).
- HubSpot toggles with no name, a stage select with no name, a progress row with a prohibited label, and eight inline links distinguished by color alone.
These rules now fail the run if they come back. Remaining (reported, not blocking): color contrast on 32 screens, each a local class (finance hints in `text-ink-2` on tinted panels, `bg-orange/15` chips, avatar initials, `text-orange/80` links); target size under 24px on 6 screens (strategy row icons, household remove); 8 horizontally scrolling tables a keyboard cannot reach (finance forecast, model, revenue, pledges, grants, calendar, my week, YGB). Full list by route: `e2e/v4/.logs/a11y-summary.md` after a run.

## Learning

**Not met.** Section 12 asks for three things; none exist yet:
- Error reporting on server and client, with org and route and no personal data. Today `app/admin/error.tsx` writes `console.error` with the route and digest, visible only in Vercel logs.
- A failed-save and failed-cron log operators can see. Today a failed save is a toast for the person who hit it, nothing more.
- Per-org counts of Section 9 workflow completion, setup progress and errors.

Smallest design (not built):
1. One table, `ops_events` (`id, org_id, at, kind, name, route, status, detail jsonb`), RLS: insert by the service role only, read by operators only. `kind` is `error`, `save_failed`, `cron`, `workflow` or `setup`; `detail` holds codes and counts, never record contents or names.
2. One route, `POST /api/admin/events`, behind the existing org guard, that writes a row with the caller's org and the route. Rate limited per user.
3. Three call sites: `useSaveAction` on failure (`save_failed`, the request URL pattern and status); `app/admin/error.tsx` and the API error helper (`error`, digest and route); the cron wrapper (`cron`, job and outcome).
4. Workflow counts from the same helper at the six Section 9 success points (gift saved, next step saved, attendance saved, enroll done, task done, edition compiled), and setup from the checklist's step completions.
5. One operator page under Settings (owner of the platform only) with counts per org per week and the last 50 errors.
One migration, so it waits for Remi's yes like any database change.

## What remains

Code:
- Find a donor in 3 clicks (search preview or lookup card gets the next-step actions).
- Board-viewer write controls on board, strategy, KPI notes, messages and Settings home (hide by permission; server already refuses).
- The accessibility list above (contrast, target size, scrollable tables).
- Run `e2e:smoke` and `e2e:roles` in CI.
- Observability and analytics (design above; needs a migration approved).
- `lib/comms` unsubscribe signing and the Stripe client throw at module load without their keys, which breaks `next build` without production secrets (the runner sets throwaway values). Moving the check into the call would let any environment build.

Human only:
- Three new-user usability sessions (record a gift, find a donor, take attendance).
- Backup: add `SUPABASE_DB_URL` to GitHub, fix the nightly job, and test one restore before any pilot org has data.
- Supabase settings: TOTP two-step login (merge #602 first), leaked-password protection, magic-link signups off.
- Gmail verification: privacy policy page and the Google consent screen review.
- HubSpot first run for Ambition Angels, watched, after the pinning in #587.
- Decide each of the six unscheduled jobs: schedule or delete.
- Time one throwaway org from answers file to first gift, and one ED's first session.
