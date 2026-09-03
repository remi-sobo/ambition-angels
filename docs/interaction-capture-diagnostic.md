# Interaction capture diagnostic (2026-09-03)

Read-and-report. No fix is proposed. Companion to
`docs/unapplied-migrations-triage.md` (HubSpot outage) and
`docs/schema-drift-audit.md`.

The question was not why HubSpot broke; it was why native interaction capture
never worked. Short answer: it was never run by anything but a human pressing a
button, and the button was pressed on eleven days between 2026-06-18 and
2026-07-20 against one mailbox. Every scheduled job in this project, not just
Gmail, has been returning 401 (section 1.4).

## 0. The split: 55,422 interactions by source

`interactions` has 17 columns (`id, org_id, constituent_id, kind, occurred_at,
notes, logged_by, created_at, external_source, external_id, direction,
subject, thread_id, body_preview, is_private, matched_email, shannon_present`).
55,404 rows belong to Ambition Angels, 18 to the Young, Gifted & Black demo org.

| `external_source` | Rows | `occurred_at` range | `created_at` range (when the row was written) | Writer |
|---|---|---|---|---|
| `hubspot` | **54,141** | 2022-09-01 → 2026-12-01 | 2026-06-12 → **2026-06-17** | SQL `fr_sync_hubspot_to_spine` step 6, projecting `hs_engagements` |
| `gmail` | **1,244** (1,059 messages, 638 constituents) | 2026-04-09 → **2026-05-24** | 2026-06-18 → **2026-07-20** | `lib/fundraising/gmail-sync.ts` |
| `meeting` | 19 | 2026-06-25 → 2026-07-16 | 2026-06-26 → 2026-07-21 | `lib/meetings/match.ts` (calendar meeting matcher) |
| `meet` | 0 | — | — | `app/api/admin/meet/connections/[id]/book` (never produced a row) |
| null (manual) | 18 | 2026-02-12 → 2026-07-16 | 2026-06-18 → 2026-07-20 | `POST /api/admin/interactions`; 17 of 18 are YGB demo rows, 1 is AA |

By kind: email 49,266, meeting 3,485, note 2,663, event 4, call 4. `is_private`
is true on 0 rows. `direction` is set only on the 1,244 Gmail rows (682
outbound, 571 inbound); HubSpot rows carry none.

Monthly, by `occurred_at`, all sources:

| Month | hubspot | gmail | meeting | manual | Total |
|---|---|---|---|---|---|
| 2026-01 | 547 | | | | 547 |
| 2026-02 | 729 | | | 1 | 730 |
| 2026-03 | 634 | | | | 634 |
| 2026-04 | 1,636 | 874 | | 1 | 2,511 |
| 2026-05 | 446 | 370 | | 2 | 818 |
| 2026-06 | 224 | | 11 | 9 | 244 |
| 2026-07 | 2 | | 8 | 5 | 15 |
| 2026-08 | | | | | 0 |
| 2026-09 | | | | | 0 |

Two things the split makes explicit:

- **HubSpot's own engagement volume was collapsing before the mirror froze.**
  `hs_engagements` by month of occurrence: Apr 841, May 246, Jun 125, Jul 2.
  April→May is a 71% drop inside HubSpot itself; the 06-16 freeze only removed
  the tail. Staff had already largely stopped logging in HubSpot.
- **Gmail never covered anything after 05-24**, and never covered any mailbox
  but one. The 04-09 → 05-24 window is the whole of native capture, ever.

Last successful write per path: hubspot 2026-06-17 (projection after the last
engagement sync); gmail 2026-07-20; meeting 2026-07-21; manual 2026-07-20 (AA's
single manual row is from 06-18); meet never. **Nothing has written an AA
interaction since 2026-07-21.**

## 1. The native path, end to end

### 1.1 `gmail_sync_jobs`

Three rows in the table's whole life. No job has ever finished `completed`.

| Job | Started | Finished | Status / mode | Scanned | Logged | Skipped | Errors |
|---|---|---|---|---|---|---|---|
| `073206a3` | 06-17 21:05:36 | — | running / backfill | 1,280 | 0 | 1,151 | 129 |
| `acc825b1` | 06-17 21:05:48 | 07-21 16:42 | **failed** / backfill | 6,000 | 1,059 | 4,723 | 219 |
| `236a6e7a` | 09-03 17:38 | — | running / incremental | 40 | 0 | 40 | 0 |

Failure modes, in order of occurrence:

1. **Double start (06-17 21:05).** Two backfills created twelve seconds apart
   from the admin button (`GmailSyncButton.tsx`). The button polls one job id;
   the other (`073206a3`) advanced for eight minutes and has sat in `running`
   since. `latestGmailJob` orders by `started_at`, so the orphan is never
   resumed and never blocks; it is just permanently wrong in the table.
2. **218 matched messages dropped on day one.** Every upsert on 06-17 failed
   with `there is no unique or exclusion constraint matching the ON CONFLICT
   specification`: the code conflicts on
   `(external_source, external_id, constituent_id)` and
   `interactions_external_idx` was still partial until
   `fix_interactions_external_idx_full_unique` was applied at 06-18 00:13 UTC.
   The sync records the error, counts the message as processed, and moves the
   page token on. Gmail lists newest first, so those 218 were the newest
   matching messages, the 05-24 → 06-17 window. **0 of the 218 message ids
   exist in `interactions` today**; nothing ever retried them. That is why
   native capture ends on 05-24 even though the mailbox was read through
   06-17.
3. **Progress only when a human clicked.** Rows were created on eleven
   distinct days (06-18: 10, 06-19: 3, 06-24: 752, 06-25: 37, 06-26: 76,
   06-29: 188, 07-03: 20, 07-10: 22, 07-17: 127, 07-19: 3, 07-20: 6). An hourly
   cron would have produced a continuous trickle. See 1.4.
4. **`list: invalid_client` (07-21 16:42).** The Gmail `messages.list` call was
   rejected by Google's OAuth client (the `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` triple), which the code
   treats as terminal: the job was finalized `failed`. The same triple worked
   again today (job `236a6e7a` listed a page without error), so the client was
   either rotated and restored or rejected transiently. The failed job's
   watermark was never promoted (`last_internal_date` is 0 on all three rows),
   so the next "incremental" run has no watermark and lists from the newest
   message again.
5. **Today's run (09-03 17:38 UTC).** Started from the button as
   `incremental` with watermark 0: 40 messages scanned, 40 skipped, 0 logged,
   then stalled after one page at 17:38:46. The crons at 17:45 and 18:45 did
   not advance it (1.4).

### 1.2 Which mailboxes are covered

**One: `remi@ambitionangels.org`.** `lib/google/auth.ts` builds a single OAuth2
client from `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a long-lived
`GOOGLE_REFRESH_TOKEN`, and every Gmail call in `lib/google/gmail-read.ts` uses
`userId: "me"`, which is whoever minted that refresh token. `gmail_sync_jobs.mailbox`
has a column default of `'remi@ambitionangels.org'` and the code never sets it.

There is **no service-account or domain-wide-delegation code anywhere** in
`lib/` or `app/`: no `google.auth.JWT`, no `GOOGLE_SERVICE_ACCOUNT_*`, no
`subject:` impersonation. If a Workspace service account exists, nothing in
this repo uses it, and whether delegation is configured on the Google side
cannot be verified from here; from the code's point of view it does not exist.

The per-user Google connection flow (`lib/google/oauth.ts`, the `connections`
table: 15 active `google_calendar` rows across 2 users) requests only
`https://www.googleapis.com/auth/calendar`. Shannon's connected Google account
therefore cannot read Gmail even if the sync were pointed at it.

### 1.3 How an email becomes an interaction

`advanceGmailJob` (`lib/fundraising/gmail-sync.ts`), one page of 40 per call:

1. `listMessageIds` (no query on backfill; `after:<watermark>` on incremental),
   spam and trash excluded.
2. `getMessage` metadata only: From, To, Cc, Subject, Date, Gmail snippet.
3. `counterpartyEmails`: every address in From + To + Cc, lowercased, minus
   any at `STAFF_EMAIL_DOMAIN` (default `ambitionangels.org`). Zero
   counterparties (staff-to-staff) → skipped.
4. Match: `constituents … .overlaps("emails", parties)` scoped to the job's
   org. **This checks the full `emails` array, not a single primary address.**
   It is an exact, case-sensitive array overlap; parties are lowercased and 0
   of AA's 2,447 stored emails contain uppercase, so case is not currently
   losing matches. No name matching.
5. One `interactions` row per matched constituent (`kind = 'email'`,
   direction from Gmail's SENT label or a staff From, `matched_email` = the
   first overlapping address, `is_private = false` always,
   `shannon_present` = a second staff address was on the message), upserted on
   `(external_source, external_id, constituent_id)` with `ignoreDuplicates`.
6. If outbound with a teammate on the thread, a `connection_candidates` row
   (58 exist).

Fan-out: 117 of the 1,059 logged messages produced more than one row (max 8
for one message), which is why 1,244 rows exist for 1,059 messages. That is
either several constituents on one thread or several constituent records
sharing an address; the code cannot tell the difference and logs both.

### 1.4 What fraction produces no interaction, and why

From the only substantial run (`acc825b1`, 6,000 messages, the newest
roughly ten weeks of the mailbox):

| Outcome | Messages | Share |
|---|---|---|
| Logged | 1,059 | 17.7% |
| Skipped | 4,723 | 78.7% |
| Upsert error (dropped, never retried) | 218 | 3.6% |

The code keeps **one skip counter**. Staff-to-staff mail, mail whose
counterparty is not a constituent, and `messages.get` failures all increment
`skipped` with no reason recorded, so the 78.7% cannot be split from data.
There is no private filter (`is_private` is hard-coded false and 0 rows carry
it) and no explicit internal filter beyond the staff-domain strip. The only
silent drop is the upsert-error path: the error is appended to the job, the
message is counted as processed, and the page token advances.

Today's 40-message page logged 0 of 40, which says the newest mail in the
mailbox is mostly not addressed to or from anyone in `constituents` (2,446 of
AA's 3,586 constituents carry an email; 2,482 distinct addresses).

**Why nothing scheduled ever ran.** Every `/api/cron/*` route checks
`Authorization: Bearer ${CRON_SECRET}`. Vercel runtime logs for the last 24
hours: `/api/cron/calendar-sync` 96 requests, all **401**; `/api/cron/journeys`
24, all 401; `/api/cron/hubspot-sync` 14 in seven days, all 401;
`/api/cron/gmail-sync` 24 requests per day (the aggregate by status timed out,
but it runs the same check as the routes that return 401). The schedules fire;
the functions reject them. `CRON_SECRET` is either not set for the production
environment or not the value Vercel is sending. This is why Gmail progress only
ever happened on button-press days, why all 19 HubSpot jobs carry a human
`triggered_by` and none the cron's `null`, and why `calendar_sync_jobs` rows
still appear (45 today) only because the agenda UI and the Google webhook call
the admin sync route directly. The HubSpot cron's "failing twice daily" is a
401, not the `totals` column; the `totals` bug breaks the manual button.

## 2. Plain statement

If the HubSpot mirror were switched off tomorrow, BloomOS would record, per
month, **zero interactions**, against **zero mailboxes**: every native path is
idle and has been since 2026-07-21, and the scheduler that was supposed to
drive them has never authenticated.

If the two conditions the code assumes were true (a working `CRON_SECRET` and
a valid Google OAuth client), the observed capture rate for the **one**
covered mailbox is 874 rows (about 750 messages) in April and 370 in May, so
on the order of **400 to 900 interactions a month from `remi@ambitionangels.org`
alone**, plus roughly 10 meeting rows a month when someone presses "Sync
meetings" and about one manual row. Shannon's mailbox, and any other staff
mailbox, contributes nothing under the current auth model.
