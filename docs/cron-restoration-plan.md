# Cron restoration — inventory, blast radius, diagnosis, staged plan (2026-09-03)

Read-and-report. No environment variable, `vercel.json` entry, or database row
was changed. Companion to `docs/interaction-capture-diagnostic.md` (which found
the 401s) and `docs/unapplied-migrations-triage.md`.

**Headline, restated plainly.** Ten schedules in `vercel.json` fire on time;
ten route handlers reject every invocation with 401 because the value they
compare against `Authorization: Bearer …` is not present in the production
runtime. No scheduled job in BloomOS has ever completed a run. The cascade Remi
listed is confirmed against production (section 4). Fixing the one variable
would switch on all ten jobs at once against five weeks of stale state, so the
order of restoration matters more than the fix.

Two facts change the blast-radius arithmetic and are stated up front:

1. **Operator email is currently undeliverable.** Every operator send goes
   through Resend from `careers@mail.ambitionangels.org`, and Vercel's runtime
   errors show Resend rejecting that sender with
   `403 The mail.ambitionangels.org domain is not verified` (seen 06-24 and
   again 09-02 from `/api/admin/report`). Journeys and auto-receipts use the
   same domain. So the daily reminders, the Monday digest, notification
   emails and journey steps would all *attempt* to send and fail. Only
   meeting reminders, which send through Remi's Gmail token, would deliver.
2. **The 11 stewardship rules are not evaluated by any cron.** They run in
   `processGiftStewardship`, called only from `POST /api/admin/gifts` when a
   gift is entered by hand. Restoring `CRON_SECRET` does not evaluate them.
   Their match against today's data is reported anyway (section 2.5): it is
   zero for every rule, because no org has recorded a gift in the last 30 days.

## 1. Inventory: every cron route

Schedules are UTC from `vercel.json`. "Sends" means mail or a message to a
person; API calls to Google or HubSpot are noted separately.

| Route | Schedule | Reads | Writes | Outbound | Class |
|---|---|---|---|---|---|
| `calendar-sync` | `*/15 * * * *` | `connections` (google_calendar), Google Calendar API | `calendar_events` (upsert + stale delete), `calendar_sync_jobs`, `connections.meta.sync_token` | none | writes-internal |
| `calendar-watch-renew` | `0 8 * * *` | `connections` | `connections.meta.watch` | Google Calendar push-channel registration (to Google, not a person). Inert unless `APP_ORIGIN` is configured; returns null otherwise. | writes-internal |
| `hubspot-sync` | `0 7,19 * * *` | HubSpot API, `hs_sync_jobs` | `hs_sync_jobs`, `hs_*` mirror, then `fr_sync_hubspot_to_spine` → `constituents`, `opportunities`, `gifts`, `interactions`, `imports` | none | writes-internal (currently throws on `totals`, see triage §2.3) |
| `gmail-sync` | `45 * * * *` | Gmail API (Remi's token), `gmail_sync_jobs`, `constituents` | `gmail_sync_jobs`, `interactions`, `connection_candidates` | none | writes-internal |
| `metric-snapshots` | `0 13 * * *` | `plan_kpis`, `metric_definitions`, finance/fundraising tables | `plan_kpis.current/status`, `plan_kpi_snapshots`, `metric_snapshots` (day-unique upserts) | none | writes-internal |
| `stewardship-milestones` | `30 13 * * *` | `gifts`, `constituents`, `ops_tasks` | `ops_tasks` (labels `sys:ack` + `sys:milestone:<key>`, idempotent) | none; creates internal tasks assigned to the default steward | writes-internal |
| `journeys` | `15 * * * *` | `journeys`, `journey_steps`, `gifts`, `recurring_plans`, `constituents`, `email_suppressions`, `org_comms_settings` | `journey_enrollments` | **Resend email to constituents** per due step | sends-outbound |
| `meet-reminders` | `0 * * * *` | `bookings`, `meeting_types` | `bookings.reminder_sent_24h/1h` | **Gmail email to booking attendees** (24h and 1h before) | sends-outbound |
| `daily-reminders` | `0 14 * * *` | `grant_requirements`, `opportunities`, `compliance_items`; also runs `refreshAllPlanMetrics` and `prewarmNarrative` (Anthropic call, `claude-sonnet-4-6`) | `plan_kpis`, `plan_kpi_snapshots`, `metric_snapshots`, `bloomos_briefing_narrative` | **Resend email to operators** (one message, all recipients) | sends-outbound |
| `weekly-digest` | `30 14 * * 1` | `gifts`, `constituents`, `audit_log`, `grant_requirements`, `opportunities`, `ops_tasks`; runs `refreshAllPlanMetrics` and `generateBriefing` (Anthropic call) | `briefings`, metric tables as above | **Resend email to operators**, one personalised message each | sends-outbound |

Nothing is purely read-only. The closest are `calendar-watch-renew` (a no-op
without `APP_ORIGIN`) and `metric-snapshots` (idempotent day-unique upserts).

Two tenant observations that belong in the inventory:

- **Operator recipients are not org-scoped.** `getOperatorEmails()` reads
  `org_email_allowlist` for `owner`/`admin` across *all* orgs. Today that is
  six addresses: `remi@`, `shannon@`, `kendrasobo@gmail.com`,
  `remisobo@gmail.com` (AA owners), `denise@ygbpeninsula.org` (YGB admin) and
  `susan@safespace.org` (SafeSpace admin). The daily reminders and the Monday
  digest, whose content is AA's grants, compliance items and pipeline, would
  go to the YGB and SafeSpace admins. The digest body is org-fenced to the
  resident org; the recipient list is not.
- `daily-reminders` does not org-scope its queries at all (grant requirements,
  opportunities and compliance items are read across orgs), so a tenant-two
  deadline would appear in AA's operator email.

## 2. Blast radius per outbound job, as of 2026-09-03

### 2.1 `daily-reminders` (first run 14:00 UTC after the fix)

Would attempt **one email to 6 recipients** (the roster above), subject
"⏰ 16 deadlines need attention", containing:

- 5 overdue compliance filings: Board conflict-of-interest annual disclosures
  (07-31), Form 941 quarterly payroll taxes (07-31), CA DE-9 Q2 (07-31),
  St. Mark AME facility agreement renewal (08-31), General liability policy
  renewal (09-01).
- 7 overdue grant deliverables: Bella application (07-31), Cal Henderson
  "Application to Victoria" and application (07-31), General operating
  support 2026 mid-year narrative + financials (07-31), Freedom Summer 2027
  letter of inquiry (08-15), Camelback Ventures 2026 application (08-31),
  Twilio Tech Innovation Grant application (08-31).
- 0 items coming up (nothing due in exactly 14, 7 or 1 days).
- 4 major-gift moves due: Lawrence family scholarship anchor ($50k, next step
  08-07), Westbay Fund Freedom Summer 2027 ($40k, 08-15), Menlo Tech Gives
  fall renewal ($10k, 09-01), Copley Saturday Academy expansion ($25k, 09-02).

Overdue sections repeat every day by design, so this exact email would go out
daily until the items are closed. **Delivery would fail** at Resend on the
unverified domain until that is fixed; the job would still run its metric
refresh and its Anthropic narrative call.

### 2.2 `weekly-digest` (first Monday 14:30 UTC)

Would attempt **6 personalised emails**, one per operator: 0 gifts last week,
0 new constituents, 0 pipeline moves, "19 gifts awaiting acknowledgment",
"4 major-gift moves overdue", 0 grant deliverables due in 14 days, and a
per-operator overdue CRM section: Remi 17 overdue tasks, Shannon 1. The four
non-AA-staff recipients (two Gmail owners, Denise, Susan) match no assignee
and would get the org-wide 18. It also calls Anthropic once and writes the
first-ever `briefings` row. Same Resend failure applies.

### 2.3 `meet-reminders` (hourly)

**0 emails.** 4 bookings exist, none confirmed with a future start. This is
the only outbound job whose delivery path (Gmail API) works today.

### 2.4 `journeys` (hourly)

**0 emails, 0 enrollments.** The `journeys` table is empty; there is nothing
to enroll on and nothing to advance. The lapsed-donor trigger would, if a
journey existed, consider roughly 35 LYBUNT candidates among 145 emailable
donors. Not applicable today.

### 2.5 `stewardship-milestones` (daily) and the 11 rules

The cron creates `ops_tasks`, never mail. Evaluated against today:

| Detector | Would create |
|---|---|
| Giving anniversary (first gift 1–5 years ago on today's date) | 0 |
| Second gift in the last 2 days | 0 (last AA gift 07-03; last gift anywhere 07-16) |
| Impact follow-up (gift ≥$250 thanked 15–30 days ago) | 0 |

The 11 `stewardship_rules` (6 AA, 5 SafeSpace; actions are `create_task`,
`create_task_and_draft`, `escalate`; none is `auto_email`) all carry
`max_age_days: 30` (one SafeSpace rule 60). Matches against current gifts:

| Rule (org) | Condition | Matches today |
|---|---|---|
| First gift, personal welcome call (AA, SafeSpace) | first gift, ≤30d | 0 |
| Major gift $1,000+, personal/leadership call (AA, SafeSpace) | ≥$1,000, ≤30d | 0 |
| Major gift, also a task for Remi (AA, escalate) | ≥$1,000, ≤30d | 0 |
| In-kind gift, letter (AA) | method in_kind, ≤30d | 0 |
| Receipt-required $250+, personal email (AA, SafeSpace) | ≥$250, ≤30d | 0 |
| Smaller / any other recent gift, personal email (AA, SafeSpace) | ≥$0.01, ≤30d | 0 |
| Youth handwritten note SYAB (SafeSpace, escalate) | ≥$0.01, ≤60d | 0 |

No org has a gift dated in the last 30 days (YGB has 3 in the last 60, none
matching the 60-day rule's org). Every rule's action is internal (an
`ops_tasks` row and, for `create_task_and_draft`, a stored draft); the only
external action in the matrix, `auto_email`, is not configured on any rule.
The fear that eleven rules would fire against 3,631 stale constituents does
not materialise: the matrix keys on gift age, not interaction age, and it is
not on the cron path.

### 2.6 Notification emails

`notify()` emails only `research.completed` / `research.failed`, via the same
operator sender. 6 notifications exist, 0 emailed; none is produced by a cron.

## 3. Diagnosis of the secret

What is known, in order of certainty:

1. **The functions execute and reject.** Runtime logs for the last 6 hours
   show `/api/cron/calendar-sync` invoked 24 times, `source = function`, all
   401. The request reaches the handler; the 401 is the handler's own
   `{ error: "unauthorized" }`, not the platform's. Deployment Protection
   (Vercel Authentication is on, `all_except_custom_domains`) is not the
   blocker: a platform block would not run the function.
2. **The check is written the way Vercel documents it.** Vercel sends
   `Authorization: Bearer <CRON_SECRET>` on cron invocations when a
   `CRON_SECRET` environment variable exists on the project. All ten handlers
   compare `req.headers.get("authorization")` (case-insensitive) with
   `` `Bearer ${process.env.CRON_SECRET}` `` and return 401 when the variable
   is empty. That is the reference implementation.
3. **Therefore the variable is absent or wrong in the production runtime.**
   `process.env.CRON_SECRET` is either unset for the Production environment
   (set only for Preview/Development, or never set), or was added after the
   current production deployment was built (serverless functions read the
   environment snapshot taken at deploy; a value added later needs a
   redeploy), or holds a value different from the one Vercel is sending
   (only possible if it was edited after the cron registration picked it up,
   which again resolves on redeploy).
4. **It has never worked.** All 19 HubSpot jobs since 05-07 carry a human
   `triggered_by`; `briefings` has never had a row; the Gmail sync advanced
   only on button-press days. The `vercel.json` crons entered the repo in the
   07-21 import commit, the specs reference `CRON_SECRET` as a pending ops
   step on 06-25 ("ensure `GOOGLE_REFRESH_TOKEN`/`CRON_SECRET` set"), and
   `.env.example` documents it. Nothing in the repo or the ledger records it
   being set.

What cannot be determined from here: the Vercel MCP surface in this session
exposes project metadata and logs but not environment variable names or
scopes, so "unset" versus "set on the wrong environment" versus "set after the
last deploy" has to be read off the Vercel dashboard (Project → Settings →
Environment Variables → `CRON_SECRET`, check the Production checkbox and the
created date against the current production deployment's date).

## 4. The cascade, confirmed

| Signal | Production |
|---|---|
| `briefings` | 0 rows |
| `notifications` | 6 rows, 0 emailed |
| `metric_snapshots` | 47 rows over 10 distinct days, against 67 active definitions |
| `plan_kpi_snapshots` | 4 rows |
| `journey_enrollments` | 0 (and 0 journeys defined) |
| `research_runs` | 0 |
| `stewardship_rules` active | 11, never evaluated by a schedule |
| Gifts pending acknowledgment | 19 AA (22 across orgs); `acknowledgments` 1 row ever; 5 open `sys:ack` tasks |
| Overdue grant requirements / compliance items | 7 / 5, no reminder ever sent |
| `hs_sync_jobs` cron-triggered | 0 of 19 |
| `gmail_sync_jobs` | 3 ever, none completed |
| `calendar_sync_jobs` (control group, UI-driven) | 45 today, 217 total |

The one difference from the numbers in the prompt: `metric_snapshots` span 10
distinct capture days, not 3. Still nowhere near daily.

## 5. The 218 dropped Gmail messages: recoverable

Confirmed on all three points:

- **The messages exist.** Two of the 218 ids were fetched from the mailbox
  today by metadata: `19ed7543c00e7e91` (sent 06-17 20:44 by Remi to
  lightinactionmedia@gmail.com with Shannon on copy, HubSpot bcc) and
  `19ed732740b48c49` (received 06-17 20:07 from lestes@calendow.org, the
  California Endowment, with tunde@streetcode.org). They are ordinary,
  un-deleted messages; the ids are Gmail-permanent.
- **The failure was the index gap.** Every one of the 218 errors is
  `upsert: there is no unique or exclusion constraint matching the ON CONFLICT
  specification`, all timestamped 06-17 21:05–21:13, and
  `interactions_external_idx` became a full unique index on
  `(external_source, external_id, constituent_id)` at 06-18 00:13 UTC. The
  same upsert has succeeded on every page since.
- **Nothing retried.** 0 of the 218 ids are in `interactions`; the job
  counted them as processed and moved its page token past them. They are the
  newest matched mail of the backfill, the 05-24 → 06-17 window, which is
  exactly where native capture stops.

What a targeted re-fetch needs: the 218 ids are already stored, verbatim, in
`gmail_sync_jobs.errors[].message_id` on jobs `acc825b1` and `073206a3`, so no
mailbox search is required. The current sync has only two modes (backfill from
the newest message, incremental by `after:` watermark); neither takes an id
list or a bounded window, though `listMessageIds` already accepts an arbitrary
Gmail query, so `after:2026/05/23 before:2026/06/18` (about 3,000 messages by
the backfill's rate) or a direct `getMessage` loop over the 218 ids are both
small additions. Matching would run against today's `constituents`, so the
re-fetch may match more than 218 rows. The upsert is idempotent, so
re-processing already-logged messages is harmless. One dependency: the Google
OAuth client that returned `invalid_client` on 07-21 worked again today; the
re-fetch relies on it staying valid.

## 6. The double-submit bug

Two occurrences, same shape: HubSpot jobs `9a1c2d93`/`985effdf` (05-22,
0.7 s apart) and `ecdbe79a`/`75fca19b` (07-21, 1.4 s apart); Gmail jobs
`073206a3`/`acc825b1` (06-17, 12 s apart). In each pair the client polls one
id and the other sits in `running` forever.

Where it comes from: both buttons call `fetch(... POST)` with no in-flight
state. `HubspotSyncPanel` disables the button on `job.status === "running"`,
but `job` is only set from the response, so a second click during the
round-trip is accepted. `GmailSyncButton` has no disabled state at all.
Server-side, `createJob` and `createGmailJob` insert unconditionally; neither
looks for an existing `running` job.

Where the guard belongs: **the server, in `createJob` / `createGmailJob`**,
returning the existing `running` job (per org) instead of inserting a second
one, with a **partial unique index** as the backstop
(`hs_sync_jobs (org_id) where status = 'running'`, likewise
`gmail_sync_jobs (org_id) where status = 'running'`) so a race between two
requests cannot produce two rows even if the application check is bypassed.
The client-side in-flight disable is a courtesy, not the guard. The three
orphans (`9a1c2d93`, `ecdbe79a`, `073206a3`) block nothing today but would
block a cron resume if any of them were ever the newest row; they should be
marked `failed` with a `finished_at` before the schedules are switched on.
Today's Gmail job `236a6e7a` is the newest row and is `running`; the first
authenticated cron tick will resume it, which is fine.

## 7. Staged restoration order (proposed, not executed)

Precondition for every stage: the three orphaned jobs marked `failed`;
`hs_sync_jobs.totals` applied (or the HubSpot cron will throw on its first
authenticated tick, per the triage); a decision on the operator recipient
roster (section 1), because stage 3 sends to it.

**Stage 0 — verify the variable without turning anything on.** Read
`CRON_SECRET` in the Vercel dashboard for the Production environment and
compare its created date with the current production deployment. Do not set
it yet. If it must be set, the plan below assumes the schedules stay as they
are and the *handlers* gate themselves; the cheapest way to stage is to leave
the ten `vercel.json` entries alone and let each job's own preconditions hold
it back, which is why the ordering below is by side effect, not by editing
schedules.

**Stage 1 — internal, idempotent, no mail.** `metric-snapshots`,
`calendar-sync`, `calendar-watch-renew` (a no-op without `APP_ORIGIN`),
`gmail-sync`. Verify after the first day: `metric_snapshots` gains 67 rows for
one `captured_on`; `plan_kpi_snapshots` gains rows; `calendar_sync_jobs` shows
`triggered` rows on the quarter-hour with no `failed`; `gmail_sync_jobs`
`236a6e7a` advances past 40 scanned and reaches `completed`, and the next
hourly tick creates an `incremental` job with a non-zero watermark. Confirm
`interactions` rows with `external_source = 'gmail'` appear with
`occurred_at` after 07-21.

**Stage 2 — internal writers with task side effects.**
`stewardship-milestones` (creates `ops_tasks` assigned to the default steward;
0 today, so the first run is a no-op and proves idempotency), then
`hubspot-sync` only after the `totals` column exists, and only if the mirror
is wanted at all given HubSpot's retirement; otherwise leave its schedule
failing on purpose and say so. Verify: no duplicate `sys:milestone` labels;
`hs_sync_jobs` rows with `triggered_by` null.

**Stage 3 — outbound senders, last, one at a time.** First `meet-reminders`
(Gmail path, 0 sends today, harmless proof that the hourly tick reaches a
sender). Then, only after the Resend domain is verified *and* the operator
roster is decided, `daily-reminders` and `weekly-digest`; their first sends
carry the 16 overdue items and the 19 pending acknowledgments listed in
section 2, so clear or acknowledge what is genuinely stale first, or accept
that the first email is a month-late list. `journeys` last, and only once a
journey is deliberately defined; today it has nothing to send.

**Between every stage:** read the runtime logs for the routes just enabled
(status codes should move from 401 to 200), and check the tables named above
before the next tick, so a job that misbehaves is caught on its first run
rather than its thirtieth.

## 8. Declined

- **HubSpot `sales-email-read` scope.** Not pending. Engagement volume in
  HubSpot was 2 in July and the mirror is being retired; restoring a scope to
  resume capturing almost nothing is declined, as directed. The 403 stays in
  the job errors as history.

No fix in this document has been applied. Stop.

## 9. Step 1 applied (2026-09-03): schedules staged, orphans closed

`vercel.json` now carries only the safe tier from Stage 1: `gmail-sync`,
`calendar-sync`, `calendar-watch-renew`, `metric-snapshots`. JSON cannot carry
a comment, so the removed entries are recorded here; each returns in a later
PR, one tier at a time, after `CRON_SECRET` is verified working in production:

| Removed schedule | Was | Returns |
|---|---|---|
| `stewardship-milestones` | `30 13 * * *` | Stage 2 (creates `ops_tasks`, no mail) |
| `hubspot-sync` | `0 7,19 * * *` | Held. Throws on the missing `hs_sync_jobs.totals` column, and HubSpot is being retired, so it needs a decision rather than a schedule. |
| `meet-reminders` | `0 * * * *` | Stage 3, first sender (Gmail path, 0 sends today) |
| `daily-reminders` | `0 14 * * *` | Stage 3, after Resend is verified and the 16 overdue items are decided |
| `weekly-digest` | `30 14 * * 1` | Stage 3, after `daily-reminders` |
| `journeys` | `15 * * * *` | Stage 3, last, only once a journey is deliberately defined |

The three orphaned `running` rows (section 6) are closed by
`docs/ops/2026-09-03-mark-orphaned-sync-jobs-failed.sql`, a one-off data fix
pasted by hand after review; it is not a migration. `gmail_sync_jobs`
`236a6e7a` stays `running` on purpose so the first authenticated tick resumes it.
