# Pre-SafeSpace hardening

Pulled out of V4 on 2026-11-20 with Remi's approval. These are the audit findings that cannot wait for V4's staged gates, because SafeSpace goes live in about two weeks. One PR per item, each reviewed and merged by Remi. Numbers match the table in [the executive summary](README.md).

## Done

| # | Fix | PR |
|---|---|---|
| 1 | Not-logged-in callers can no longer create, complete or snooze tasks and compliance items. Applied to production and verified. | remi-sobo/ambition-angels#582 |

## Wave 1: in progress, code only, no database changes

| # | Fix | Branch |
|---|---|---|
| 2 | Comms: a saved view used as a segment resolves to that view, never to everyone. Unknown filters resolve to nobody. Archived donors excluded. Recipient count shown before sending. | `claude/presafespace-comms-segments` |
| 4 | Ambition Angels-only data and the teen games admin are gated to the Ambition Angels org and to roles that may write. | `claude/presafespace-aa-only-gates` |
| 5 | Thank-yous, tax receipts, unsubscribe links and alarm emails carry the sending org's identity. An org that has not set up its identity is refused, never sent as Ambition Angels. | `claude/presafespace-org-identity` |
| 6, 7 | HubSpot and the Gmail sync are pinned to the org that owns them. Gift entry by donor name stays inside the org and handles commas. | `claude/presafespace-integration-org-pins` |
| 11 | Totals page past 1,000 rows instead of silently stopping. | `claude/presafespace-row-cap` |

## Status, 2026-11-21

Merged: #582 (open hole), #583 (Comms saved views), #584 (AA-only data), #585 (thank-yous and receipts), #586 (1,000-row totals), #587 (HubSpot, Gmail sync, gift entry), #590 (finance categories per org; migration applied), #591 (fonts in repo), #592 (three crashing pages, silent task save), #588 (phone privacy), #589 (import and export), #593 (role checked on the server for every admin write and page).
Needs Remi: drop the RLS write policy on org_entitlements (a migration). Also found: agenda/sync runs for every user in every org. Follow-up: org-scope the gifts export and remove its test exception.

## Wave 2: after wave 1 merges (same files, so it waits)

| # | Fix | Notes |
|---|---|---|
| 3 | Check the role on the server for all 84 write routes and 47 pages, not only in the menu. Board viewers become read-only for real. Today's money card respects finance access. | Largest item. One shared guard, then module by module. |
| 8 | Finance categories per org. | Needs a database change. Remi approves before it is applied. |
| A | Test safety nets: the test database copies Supabase's default grants, so a repeat of #1 fails CI. The tenant scanner stops skipping database functions. | Small. |
| B | The phone app stops keeping donor and student pages on the device after logout. | Small. |
| F | The constituent import reads existing donors and imported gifts with no org filter, so a user in two orgs could be matched to the other org's donor. Found while fixing #11. | Small. |
| C | About 36 save actions that never check whether the save worked. | Can move to V4 Stage A if time is short. |

## Needs Remi, not code

| # | Item | What is needed |
|---|---|---|
| 9 | Off-site backup has failed all 162 runs. | Add the `SUPABASE_DB_URL` secret in GitHub. Then a PR adds the missing schemas and one restore gets tested. Also confirm what the Supabase plan backs up on its own. |
| 10 | Six jobs have no schedule: HubSpot sync, journeys, meeting reminders, daily reminders, weekly digest, stewardship milestones. | Decide per job: turn on, or delete. Turning them on starts sending emails, so this is not a silent fix. |
| D | No two-step login. Leaked-password protection is off. Magic links can create new users. | Decide what SafeSpace and board viewers must use, then change the settings in Supabase. |
| E | Gmail verification. No privacy policy page exists yet, and an older Gmail sync uses a stricter permission on the same Google app. | See the appendix in the V4 brief. |

## Then V4 resumes

Phase 1 interview, Phase 2 spec, Stage A onward, as in `specs/bloomos-v4-product-readiness-brief.md`.

## Open items for Remi (kept current, repeated in every stage report)

| Item | What is needed | Status |
|---|---|---|
| `UNSUBSCRIBE_SECRET` on the `ambition-angels` Vercel project | Copy the value from the `bloomos` project, or generate one and set it on both; redeploy | Open. That project's production deploys fail until it is set. |
| Off-site backup | Add `SUPABASE_DB_URL` as a GitHub secret; then one restore gets tested | Open |
| Six unscheduled jobs | Remi: "your recommendations". Email jobs get a per-org opt-in (Ambition Angels first, SafeSpace at go-live); daily reminders, weekly digest, meeting reminders and stewardship milestones scheduled; HubSpot after one supervised run; journeys waits for Stage D | In progress |
| Two-step login | Remi: required for everyone. Authenticator-app two-step on every admin page and route, owner reset in People and roles | In progress |
| Gmail verification for pilots | A privacy policy page, then Google's review (see the brief's appendix) | Open |
| Dead screens to delete | Approved 2026-11-21 | In progress (Stage B2) |
| `org_entitlements` write policy | Approved and applied 2026-11-21 (`entitlements_operator_only_writes`) | Done |
