# BloomOS V4 Phase 0: executive summary

Audited 2026-11-20 at `main` 37472e56 (Comms G1 to G4 included). Six code tracks plus a screenshot run on made-up data. No app code was changed. Evidence for every line is in the track reports linked at the bottom.

How to read the labels: **confirmed** means the lead re-checked it in code or in the production catalog. Everything else was verified by one audit agent in code and not yet re-checked.

## The finding

BloomOS does not need a redesign. The colors, type, shell and seven-destination navigation hold up, and all 2,161 tests pass. What it needs is three things, in this order:

1. **Close the safety gaps that a second real org exposes.** BloomOS has been safe mostly because only Ambition Angels uses it. SafeSpace starts in about two weeks.
2. **Make the product use its own kit.** The shared buttons, forms, tables and pop-ups are good and almost nobody uses them. Every list reinvents search, filters and saved views.
3. **Point every screen at the person using it.** Today is org-wide, not "mine." Records do not show their own history. Comms results reach nothing outside Comms.

## Fix before SafeSpace goes live (do not wait for V4 stages)

| # | Problem | Status |
|---|---|---|
| 1 | Anyone on the internet, not logged in, can create, complete or snooze tasks, grant requirements and compliance items in any org. Three database functions accept the public key. Cannot read data. Fix: one small migration. | confirmed in production |
| 2 | A Comms email sent to a saved view ("Lapsed", "Recurring") goes to everyone with an email address. No count is shown before sending. | confirmed in code |
| 3 | Roles are checked in the menu, not on the server. 84 write routes and 47 pages check the org but not the role, so a board viewer can edit or delete finance, student, board and compliance records, and sees cash and runway on Today. | agent verified |
| 4 | Members of any org can read some Ambition Angels data (teen quiz submissions with names and emails, HubSpot contacts, partner lists, analytics) and can approve content for the public teen games. | agent verified |
| 5 | Thank-you emails and tax receipts go out as "Ambition Angels" and state Ambition Angels' nonprofit status for every org. Unsubscribe links and alarm emails carry the same branding. | agent verified |
| 6 | HubSpot and the hourly Gmail sync are wired to Ambition Angels' accounts but not pinned to its org. Another org's donors could be pushed into AA's HubSpot, and AA's mailbox could be filed under another org. | agent verified |
| 7 | Recording a gift by donor name does not filter by org, and a name with a comma quietly creates a duplicate donor. | agent verified |
| 8 | Finance categories are one shared list, so finance does not work for a second org. | agent verified |
| 9 | The nightly off-site backup has failed all 162 runs since June. No restore has ever been tested. Supabase's own backups were not visible to the audit. | agent verified |
| 10 | Six scheduled jobs are not scheduled anywhere: HubSpot sync, journeys, meeting reminders, daily reminders, weekly digest, stewardship milestones. | agent verified |
| 11 | Attendance rates, the finance snapshot and the board report silently stop counting at 1,000 rows. | agent verified, cap inferred |

Also worth a decision soon: no two-step login anywhere, leaked-password protection is off, and the phone app keeps copies of donor and student pages on the device after logout.

## What V4 itself should do

**Design system (Stage A).** Adoption, not invention. Shared kit is imported by 25 of 530 admin files: 269 hand-built primary buttons against 42 shared ones, 440 raw inputs against 104 shared fields, 27 hand-built pop-ups against 2 shared. The one big decision: make the Donors & Funders list the standard for every list (filters in the URL, saved views on the server, server-side paging, a phone card layout) and rebuild the shared table around it. Second decision: every number on screen goes through the one component that records where the number came from.

**Navigation.** Keep the seven destinations. Add Comms as the eighth and no others. Build the Settings home that the route map already promises: about 12 setup screens are scattered and several have no link at all. Remove about 2,700 lines of dead screens, fix the dead "V2" link, and rewrite How-To and search, which still describe the V1 product to every org.

**Today and roles.** The five personas fit the roles that exist (owner, admin, staff, finance, board viewer). Development and program managers are both "staff," and no donor, program or cohort has an owner. Today needs an "assigned to me" idea, not new roles. Today's "Needs you" list currently shows the whole org's tasks.

**Workflows.** Worst three: attendance on a phone (4 to 5 taps to reach the roster, 4 taps to mark absent, saves can land out of order), enrolling a roster in a cohort (about 60 clicks for 30 students), and gift to thank-you (about 9 clicks over 3 screens, and a wrong gift cannot be edited). About 36 save actions never check whether the save worked. Dates default to tomorrow after 4pm Pacific.

**Comms.** Sending works end to end from each org's Gmail. It is still one Fundraising tab, a draft cannot be edited after creation, the segment builder is the weak link, and nothing reaches the donor timeline or Today. Recommended home: one Comms destination with Stories, Editions, Emails, Automations, Settings, with "campaign" renamed so it means one thing. The story bank is a medium-sized landing: its database tables are already in production, its consent model is built, and the rework is the nav, the hand-off to the Gmail sender, and a test file merge.

**Onboarding.** Nothing in the app can create an org, invite a user, change a role or turn on a module. A new org takes 10 operator steps today. Pilot-ready is reachable with one setup script, generic starter templates, a user and role screen, a support address in place of "tell Remi," and a written runbook. That leaves 2 operator steps per org.

**Reliability.** No error reporting: failures are visible only to the person who hit them. Donors & Funders times out (9 failures in one hour on audit day). There are no real end-to-end tests, and a staged redesign of about 149 screens needs them before Stage B.

## Already good enough, leave alone

Color and type tokens and their tests. The V2 shell and mobile bar. Toasts and confirms. `Modal`, `PageHeader`, `EmptyState`, `FilterTabs`. The Comms send queue and its handling of unclear sends. Per-org AI prompt wording. The story bank's consent model.

## Not checked

Vercel settings and logs. Supabase plan, built-in backups and login settings. Google consent screen status. Live behavior that needs a real database: save races on attendance, offline behavior, slow-network behavior. A second Supabase project named "ambition angels" appeared on audit day and was not inspected.

## Track reports

- [00 Harness and screenshots](00-harness-and-capture.md)
- [01 Design system and navigation](01-ux-design-nav.md), with the full route table
- [02 Workflows, Today and mobile](02-workflows-mobile.md)
- [03 Tenancy and security](03-tenancy-security.md)
- [04 Onboarding readiness](04-onboarding-readiness.md)
- [05 Reliability and testing](05-reliability-testing.md)
- [06 Comms](06-comms.md)
