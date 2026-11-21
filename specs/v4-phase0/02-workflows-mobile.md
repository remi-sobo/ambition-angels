# V4 Phase 0, Track 2: Workflows, connected records, Today, mobile

Read-only code audit. Checkout HEAD was `dff62859` (contains base `37472e56`). No dev server, no production calls. Status codes: **V** = verified in code, **A** = assumption, **R** = needs runtime access (live walk).

## Top findings

| # | Pri | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | P0 | Today's Money health tile reads cash, burn and runway through the service-role `getFinanceSnapshot`, gated only by the `modules.finance` entitlement. `board_viewer` has no `finance.read` in `role_permissions`, but still sees the numbers. | `app/admin/today/page.tsx` (showFinance), `lib/admin/finance.ts:103`, `supabase/migrations/create_bloomos_core.sql:138-170` | V |
| 2 | P0 | The manual gift route's name match (`constituent_name`) queries `constituents` with no `org_id` filter on a session client. RLS is permission-scoped, so a member of two orgs can attach a gift to the other org's donor. The `.or()` filter also uses the raw name unescaped, so a name with a comma or parenthesis breaks the query, finds nothing and quietly creates a duplicate donor. Passed to Track 3. | `app/api/admin/gifts/route.ts:60-95`. Same multi-org caveat is written in `lib/admin/today.ts` (loadAckFacts) | V |
| 3 | P1 | Many writes are fire-and-forget. About 36 `await fetch(...)` calls never check `r.ok`, so a 4xx or 5xx looks like success, the page refreshes and the change is quietly gone. These include completing a task in the Tasks list, completing a task from a record, reordering, archiving all done, pledge status, deleting a student, deleting board members and compliance items. | `app/admin/ops/_components/TaskListView.tsx:139,186`, `TasksSurface.tsx:107`, `app/admin/_components/EntityTasks.tsx:105`, `fundraising/pledges/_components/PledgeControls.tsx:269`, `students/_components/StudentControls.tsx:103` | V |
| 4 | P1 | "Needs you" is org-wide, not personal. The loader reads `v_obligations` without `owner_id`, so every open task in the org (assigned, unassigned, undated) competes for 7 slots. The view already exposes `owner_id`, and it is unused. | `lib/admin/today.ts:83-88`, `supabase/migrations/capture_obligations.sql:36-58` | V |
| 5 | P1 | Attendance taps are not serialized. Each tap sends its own POST with no ordering. Fast taps can land out of order, and a failed earlier tap reverts the row to a stale value. Going unmarked→absent takes 4 taps and 4 writes. The passes through "present" and "late" bump `students.last_activity_at` for a student who was absent. | `cohorts/[id]/sessions/[sessionId]/_components/AttendanceSheet.tsx:58-80`, `app/api/admin/sessions/[id]/attendance/route.ts` (touch) | V (race: R) |
| 6 | P1 | Default dates use UTC (`new Date().toISOString().slice(0,10)`). After about 4pm Pacific, gift date and interaction date default to tomorrow, and EntityTasks marks tasks overdue on the wrong day. Today itself uses `todayInTZ()` correctly. | `GiftControls.tsx` (date init), `ConstituentControls.tsx:240`, `EntityTasks.tsx` (today) | V |
| 7 | P1 | Enrolling a roster in a cohort takes 2 clicks per student, from a plain `<select>` with no search. There is no bulk enroll, and the CSV import has no cohort column. A 30-student cohort means about 60 clicks after the import. | `cohorts/[id]/_components/CohortDetailControls.tsx:190-225`, `api/admin/cohorts/[id]/members/route.ts` (single `student_id`), `lib/admin/imports/engine.ts` | V |
| 8 | P1 | The service worker caches every `/admin` page it serves (network-first, then `cache.put`), including donor and minor PII. Nothing clears the cache on logout. Offline, it serves the stale page with no indicator. The app has no `navigator.onLine` handling anywhere. | `public/admin-sw.js` (navigate branch), no `caches.delete` outside the SW | V |
| 9 | P1 | Meeting follow-ups accepted from Reed become tasks with no assignee and no due date. The meeting record has no manual "add follow-up" control. | `api/admin/meetings/[id]/suggestions/route.ts:74-82`, `meetings/[id]/MeetingDetailClient.tsx` | V |
| 10 | P1 | Task ownership keys on a first-name handle (`assigneeSlug(display_name)`). Two staff named Sam collide. Any future "assigned to me" Today depends on this. | `lib/admin/auth.ts:158-175` | V (collision effect: A) |
| 11 | P2 | Many admin API routes do no role check. Only 25 of 266 call `ctxHasPermission`, and service-role routes like attendance and ops tasks bypass RLS. The UI shows write controls to every role. Passed to Track 3. | `grep` over `app/api/admin/**/route.ts` | V |

## 1. Workflow friction report

Counts are clicks or taps on the shortest path from the most likely starting point. Typing is not counted.

### a. Record a gift and prepare its acknowledgment (P1)
| Item | Detail |
|---|---|
| Path | Search (`⌘K` or drawer) → donor → Donor 360 `DonorProfile.tsx` → Activity header "+ Add gift" `GiftControls.tsx` → Record gift. Then Fundraising → Acknowledgments `AckQueue.tsx` → row → composer `AckComposer.tsx` → Draft with AI → Send |
| Clicks / switches | About 9 clicks, 3 screens, 2 context switches. No Record-gift quick action on Today, ＋, or Quick Add |
| Fields | Amount and date are required, which is right. Method defaults to check. Campaign, fund and appeal show only when they exist (good) |
| Confusing | The thank-you composer exists only in the Acknowledgments queue. Today's AckPanel can only "Mark thanked", and the gift row just says "Thank-you pending" with no action. A wrong gift can't be edited (the PATCH route exists but has no UI caller), only deleted and re-entered, which re-runs the stewardship tasks |
| Success feedback | The form closes and the page refreshes. No toast, no "thank-you queued" message (V) |
| Failure | Server message shown inline and typed input kept (good, V) |
| Shows up next | Gift appears on Donor 360 Activity. Stewardship sets ack `pending` plus an ack task, which then appears on Today folded into one row (good, V) |
| Improve | After save: a "Prepare thank-you" button that opens AckComposer in place. Org-timezone default date. Gift edit. Record gift from ＋ |

### b. Find a donor, review history, log the next interaction (P1)
| Item | Detail |
|---|---|
| Path | Search → Donor 360 → Activity (5 shown, then expand) → "Log interaction" → kind, date, notes → Save. Next step is a separate form: EntityTasks "+ Task" lower on the page |
| Clicks | About 4 to log, plus 4 to add the follow-up task. Two forms for one thought |
| Fields | EntityTasks assignee defaults to Unassigned while ownership is enforced, so you always have to pick someone (V). QuickAdd defaults to the current user, so the two forms behave differently |
| Feedback / failure | Form closes and refreshes. Errors shown inline |
| Gaps | The Activity stream holds gifts, interactions and thank-yous. Tasks, meetings and comms sends are not in it (comms sit in their own section). Four action buttons share one header row (thank-you, Record, interaction, gift) |
| Improve | Add a "Next step" field (title, due, owner = me) to Log interaction. Default the EntityTasks owner to me. Put tasks and meetings into the timeline |

### c. Create, assign, and complete a task (P2, nearly good enough)
| Item | Detail |
|---|---|
| Path | ＋ (mobile) or Quick Add (desktop) → `QuickAddModal.tsx` (title, category, priority, assignee = me, due, project, two pin boxes) → Add. Complete from the Today row Done (5 s undo, `useDeferredActions.ts`) or the Tasks list checkbox |
| Clicks | 3 to create, 1 to complete. Reassign and re-date happen inline in the Today popout (`OpsTaskPanel.tsx`, good) |
| Unneeded | Seven fields on a phone sheet. Category, priority and the pins could collapse behind "More". No way to link a donor or record from Quick Add. `TaskEditModal` can't show or change the linked record |
| Feedback | "Task added." shows for 600 ms, then the modal closes. The button re-enables during that window, so a double tap can create a duplicate (V) |
| Failure | Today: rollback plus an Alert with the server message (good). Tasks list and EntityTasks: silent (finding 3). Leaving Today inside the undo window flushes with `keepalive` and discards the result, so a failure there is never shown (V) |
| Shows up next | On Today for everyone (finding 4). Task search hits link to `/admin/ops`, not the task |

### d. Prepare for a meeting and capture follow-up actions (P1)
| Item | Detail |
|---|---|
| Path | Work → Meetings → Upcoming → event (`meetings/upcoming/[eventId]`) → Reed agenda. Afterward: meeting record → paste transcript → "Summarize & suggest" → Accept each suggestion |
| Clicks | 4 to prep. After the meeting: 2 plus 1 per follow-up |
| Gaps | Today's My day lists events as plain text with no link to prep (V). Accepted tasks have no owner or due date (finding 9). No manual follow-up add and no EntityTasks on the meeting. The task insert and the suggestion status update aren't atomic, so a failed second write leaves the suggestion pending and it can be accepted twice (V) |
| Feedback | Errors show a generic toast ("Couldn't save"), not the server's message |
| Improve | Link My day events to prep. Accepting a follow-up should ask for owner and due date (default me, +3 days). Add a follow-up box to the meeting record |

### e. Review the organization's cash position (P2, good enough for owner and finance)
| Item | Detail |
|---|---|
| Path | Today Money health (runway, cash, burn, freshness badge) → Finance (sidebar, or More → Finance on mobile) → Dashboard `finance/page.tsx` |
| Clicks | 0 to glance, 2 to see detail |
| Gaps | The Money tile has no link to Finance and no "update anchor" action when it is stale (V). Role leak (finding 1) |

### f. Add a participant or import a roster (P1)
| Item | Detail |
|---|---|
| Path | Programs → People → Add (`NewStudentForm`: first, last, stage, leader) → Save. Import: People → "Import CSV" (a link on the page, not in nav) → `ImportWizard.tsx` upload → map → preview → commit |
| Good | Staged preview, a duplicate-skipped count, resume after an interrupted commit |
| Friction | No cohort on import, and enrolling is one student at a time (finding 7). The "Add student…" label is hard-coded and ignores terminology. The People list has no search box |
| Improve | A cohort column or "enroll all imported into…" step. Multi-select enroll with search |

### g. Take attendance from a phone: see section 4

### h. Global search (P2)
| Indexed (`app/api/admin/search/route.ts`) | Missing |
|---|---|
| constituents (ilike + trigram RPC), prospects, grants, revenue commitments, tasks, projects, partners, students (name, email, school), cohorts, bookings; interaction notes as an opt-in | gifts (amount, check number), meeting records, documents, board members, compliance items, staff, strategy objectives, applications, comms campaigns and stories, households |

Task hits go to `/admin/ops`, and revenue hits go to `/admin/finance/revenue`, not to the record (V). Sub-query failures are only logged; results stay partial with no notice. Mobile: search sits in the hamburger drawer (2 taps), not in the bottom bar or More (V). Search returns no quick actions (log, add task).

### i. Strategy objective to work item (P2)
Objective page (`strategic-plan/objective/[id]/page.tsx`) shows initiative, project and task rollups but can't create anything. Path: Projects page → new project → open it → choose the initiative in the `ProjectHeader` dropdown → add the task in `ProjectTaskList`. 4 screens, about 8 clicks, and the empty state just says "attach a project on the projects page". Improve: "Add project" and "Add task" on each initiative.

## 2. Connected records

| Record | What the detail page shows today | Missing, or forces a jump elsewhere |
|---|---|---|
| Donor/constituent `DonorProfile.tsx` (via `donors-funders/[id]`) | Stats, stage, journeys, activity (gifts, interactions, thank-yous), recurring, pledges, comms, EntityTasks, EntityDocuments, CommentThread, RailEntity, NextMovePanel | No EntityHistory. Meetings and tasks missing from the timeline. Thank-you can't be composed here. Gift Delete is hover-only |
| Gift | No detail page. A row in donor activity | Edit, receipt, ack composer, soft credits in context |
| Task | Modal only (`TaskEditModal`) | Linked record, meeting origin, comments, history |
| Meeting `meetings/[id]` | Status, matched donor or partner, Reed agenda, summary, suggestions, linked tasks | Manual follow-up, EntityTasks, documents, link from My day |
| Partner `partners/[id]` | Interactions, contacts, MOU, EntityTasks, EntityDocuments, Record | No manual "log touch" without `ai.capture`. No history or comments |
| Student `students/[id]` | Enrollment, attendance, guardians, EntityTasks, Documents, History, Comments | Best-connected record. No intake or application link (A) |
| Cohort `cohorts/[id]` | Members, sessions, EntityTasks, EntityDocuments | Bulk enroll. No history or comments |
| Grant `grants/[id]` | Requirements, asks, contacts, project tasks, EntityDocuments | EntityTasks (`grant` is an allowed link type), comments, history |

Shared pieces and how widely they're used: EntityTasks 7 pages, EntityDocuments 8, CommentThread 5, EntityHistory 3 (board, compliance, student), EntityChip 2 (documents, an unrouted queue), RailEntity 2 (donor, partner; the type allows only these two). The Today popout links back only to constituent and partner tasks, so tasks linked to a student, cohort or grant have no way back (V, `OpsTaskPanel.tsx:22`).

## 3. Today

| Panel | Source | Next action | Notes |
|---|---|---|---|
| Orientation line | `bloomos_briefing_narrative` (UTC key), else built from counts | None | After 5pm PT the narrative misses and the built line shows (V) |
| Needs you | `v_obligations` (session client, RLS), ranked by `todayRank.ts`, cap 7 + "Show all" | Popout per row, Done, Snooze, Open record, J/K | Strong design. `limit(500)` with no order, so large orgs get cut arbitrarily before ranking (V) |
| Money health | `getFinanceSnapshot` (service role) | None (no link) | Shown to every role (finding 1) |
| Mission health | Metric catalog `<Metric>` | Only the empty state links | A number with no decision attached |
| My day | `calendar_events` for the user, plus a count of `reed_drafts` | Drafts link to Inbox. Events have no link | Empty without Google Calendar |

**By role (V from RLS and permissions; R to confirm):** the page has no role logic. Content differs only through RLS on the view's arms. Owner, admin and staff see the same org-wide list. Finance sees reconciliation, compliance and document rows, but no tasks or thank-yous (no `ops.read` or `fundraising.read`), plus Money. `board_viewer` sees an empty "Nothing needs you right now. Enjoy it." plus Money and Mission. Only `capture` rows (`created_by = auth.uid()`) are personal.

**Scored against the brief's five questions (0 to 2):**
| Question | Score | Why |
|---|---|---|
| What needs my attention | 1 | Ranked and actionable, but org-wide |
| What changed since I last checked | 0 | No "since last visit" view. Notifications live behind More/Inbox |
| What am I responsible for | 0 | `owner_id` exists but is unused. Pinned-for-today tasks aren't shown |
| What is at risk or overdue | 2 | Overdue first, badges, why-lines |
| What can I finish now | 1 | Done and Snooze plus the popout. Only 4 types can be resolved |

Role-based Today needs a responsibility concept (owner_id or assignee = me, then "team" as a second tab), not new roles. It depends on fixing finding 10.

## 4. Mobile and PWA

**Shell.** Bottom bar: Today, Work, Fundraising, ＋, More (`MOBILE_BAR_KEYS`), 52 px targets, safe-area padding (good). A hamburger top bar and drawer (`V2Sidebar.tsx:183`) also hold the full nav and the only mobile search, so a phone has three ways to navigate. ＋ offers: Ask Reed, Record (`ai.capture`), Add task, Message, Report. More: the other destinations, Inbox with a badge, Settings, Record, Report, Reed. Programs, and so attendance, sits in More.

**PWA.** Manifest at `app/admin/manifest.webmanifest/route.ts`. SW `public/admin-sw.js`: network-first navigation with cache fallback, cache-first static files, `/api` never cached, an update prompt. No offline queue, offline banner, or failed-save indicator. Only Capture says "You look offline", and it keeps your words (`captureApi.ts:17`).

**Layouts.** Phone-shaped: Today (single column), Attendance list and roster, Students (cards), QuickAdd (bottom sheet, 16 px inputs so iOS doesn't zoom). Squeezed: DonorsTable and ProspectsTable (DataTable `overflow-x-auto`), 24 files with raw `<table>`, 27 with horizontal scroll. Hover-only controls in 11 files, including task "⋯" (`TaskRow.tsx:264`) and gift Delete (`DonorProfile.tsx:812`); these are invisible but still tappable on touch. Small targets: `Button size="sm"` is 32 px (Today Done and Snooze), "+ Add gift", "+ Task", "Mark rest present", Enroll (about 28 px), QuickAdd checkboxes (16 px). Native date inputs: 81 (fine on phones). Only 5 files use `sm:hidden` or `md:hidden` alternates.

**The brief's seven mobile jobs:**
| Job | Path | Verdict |
|---|---|---|
| Today's priorities | Today tab | Works. Org-wide list. Done and Snooze are 32 px |
| Find contact or participant | ☰ → Search → type | 2 taps plus typing. Not in the bottom bar |
| Take attendance | More → Programs → Attendance tab (horizontal tab strip) → session → roster. Or Today row → popout → Open record when the session is unrecorded | 4 to 5 taps to the roster. See below |
| Record conversation or follow-up | Only with `ai.capture` (Record). Otherwise open the donor and use the inline forms | Weak without Capture |
| Create or complete a task | ＋ → Add task (7 fields). Complete on Today | OK |
| Review a notification | More → Inbox (badge) | OK. Not on Today |
| Quick capture | Record (voice or typed, good failure handling) behind `ai.capture` | Good when entitled, missing otherwise |

**Attendance on a phone (P1).** Good: big rows (`py-4`), one tap = present, "Mark rest present", optimistic with revert and toast, every write audited, sessions marked held. Problems: the tap cycle makes absent cost 4 taps; writes are unserialized (finding 5); no per-row saving state; when offline every tap reverts and fires its own toast, so you can't take roll at all (the offline queue was deferred by ruling); no walk-in or add-student on the sheet; the back link goes to the V1 `/admin/cohorts/{id}` path; "Mark rest present" has no undo. Improve: separate Present and Absent buttons per row (or swipe), one queued save with a "Saved / Not saved (n)" banner, and serialize per student.

**Quick capture (P1 for non-Capture orgs).** Without `ai.capture`, the phone has no "jot a note about a donor" path. ＋ should offer Log interaction and Record gift, linked through RailEntity when you're on a record.

## 5. Data and mutation pattern

| Pattern | Evidence | Effect |
|---|---|---|
| `router.refresh()` after a write | 302 calls in 149 files. No SWR or React Query, no `useOptimistic` | Full RSC refetch after each change. On big pages (Tasks loads 1,000 rows, `ops/page.tsx`) slowness is R |
| Hand-rolled optimistic updates | Today Needs-you (deferred write, undo, rollback: the best in the app), AttendanceSheet (optimistic, revert), TaskListView reorder (local, never rolls back on 4xx) | Inconsistent |
| Silent failure | Finding 3 (about 36 calls). Today's unmount flush discards its result | Changes vanish with no message |
| Double submit | QuickAdd 600 ms re-enable. Unserialized attendance taps. Meeting accept not atomic | Possible duplicates and out-of-order writes |
| Error text | Mixed: `userMessage(res, body)` in newer forms, generic "Couldn't save" toasts in older ones | Server reason lost in older flows |
| Truncation | Tasks `limit(1000)` includes done tasks, so open tasks can drop off. `v_obligations` `limit(500)` unordered | Wrong lists at scale (R for volumes) |

## Needs a live walk (R)

1. Board_viewer, finance and staff Today: confirm the Money tile shows and what Needs you contains for each.
2. Fast attendance taps on a phone over slow 3G: does the final server state match the screen?
3. Offline: open a cached donor or student page in airplane mode. Is stale PII served, and does anything signal offline? Is the cache still there after logout?
4. Gift entered after 4pm Pacific: confirm the next-day default date.
5. Task complete with a forced 500 (Tasks list, EntityTasks, pledge status): confirm the silent revert.
6. Name-based gift entry with a comma name, and with a user in two orgs (with Track 3).
7. Mobile: layering of the top bar, drawer and bottom bar; Attendance tab strip scrolling; GlobalSearch overlay with the keyboard open; QuickAdd sheet above the iOS keyboard.
8. Hover-only "⋯" and Delete on touch: invisible but tappable?
9. Today and Tasks load time with 500+ open tasks.
10. Duplicate task from a QuickAdd double tap inside the 600 ms window.
