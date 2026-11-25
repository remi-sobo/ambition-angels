# Spec: Comms v3 (the composer, and ready for the whole list)

**Status:** Draft for Remi, 2026-11-24. Nothing built. Builds on `specs/comms-v2-gmail-amendment.md` (G1 to G4, live).
**Repo location:** `specs/comms-v3-composer.md`
**Source of lessons:** Team Esface email engine as of `57ac025` (PRs #246 to #253), read on 2026-11-24.

---

## Problem

The engine under BloomOS email is sound: Gmail sending, a queue, scheduling, a daily cap, tracking, unsubscribe, results. What sits on top of it is a small inline form. You type plain text into a box in a list, the only merge field is `{{first_name}}`, and you never see the email a real donor will get before it goes. It is not yet something to point at 2,491 people.

Team Esface has run its engine on real families for two weeks since the port and learned things BloomOS has not taken yet.

## What is true today (production, counts only, 2026-11-24)

- Ambition Angels: Gmail connected and active (since Nov 21), daily cap 400, mailing address set, no reply-to, nobody on the leadership copy list.
- 3,644 active constituents. 2,491 have an email. 124 have given, 118 of those have an email. 86 last gave before 2026.
- **771 of the 2,491 have no first name.** Today each would get "Hi friend,".
- No duplicate addresses, no malformed addresses, no organizations with an email.
- Ambition Angels has never sent a campaign: one draft, zero saved audiences. The 872 emails sent so far were other orgs on Resend. **The Gmail queue has never carried a real Ambition Angels send.**
- A campaign is capped at 2,000 recipients (`MAX_RECIPIENTS`), so "everyone" (2,491) is refused outright today.
- At 400 a day, 2,491 people takes 7 days. The 118 donors go in about a minute.

## What Team Esface learned since the port, and where BloomOS stands

| Lesson (Team Esface) | BloomOS today | Action |
|---|---|---|
| A 70-person email sat queued for six days while the page said "Sending". Fix: red line on the page at 10 minutes, alarm to HQ at 15 | Alarm fires after **24 hours** (`lib/comms/safety.ts`) | Phase 1: alarm when a campaign has started, has people waiting, and has sent nothing for 15 minutes. Skip it when the org is at its daily cap |
| Next 14 cached the queue claim, so the worker saw an empty queue | Service client already sends `no-store`. Cron route lacks `fetchCache` | Phase 1: add `fetchCache = 'force-no-store'` to the cron route as a second lock |
| Housekeeping ate the send budget | Not affected: BloomOS sends first, housekeeping after | None |
| No trace of a run that claimed nothing | Same gap | Phase 1: one audit row per worker run that finds work |
| A passing test proved nothing, because tests skip the queue | Same: test sends go straight to Gmail | Phase 1 runbook: the first real send is a small one through the queue, to staff |
| One a second was too slow; now 2 lanes, 250 ms gap | Already ported at that pace | None |
| Missing merge data: block, or show exactly who falls back and to what words | Silent fallback to "friend" | Phase 1 |
| Preview the exact email for a real person, step through everyone, remove someone from this email | None | Phase 2 |
| "Send 5 samples to me", picked from the risky cases | None | Phase 2 |
| Over 25 people, a 60 second Undo before anything leaves | None | Phase 2 |
| Send again to people who did not open or click | None | Phase 3 |
| A copy to HQ is the proof a send happened | Built (G4), list is empty for Ambition Angels | Runbook: add Remi and Shannon |

Where BloomOS is already ahead of Team Esface: a Gmail rate limit puts the message back and waits (Team Esface marks it failed for good), a running campaign can be canceled, unclear sends have "It arrived / Send again / Bounced", and the alarm goes out in BloomOS as well as by email.

## Scope

**In**
- Phase 1, safe to send: merge fields with honest fallbacks, the stuck alarm, the trace, the list-size cap.
- Phase 2, the composer: one full screen to write, see, test and send.
- Phase 3, follow-up: send again to people who did not open or click.

**Out**
- Rich HTML design, images, attachments. The point of a mail merge is that it reads like one person wrote it. Plain text with links stays.
- Sending from the org's own domain through Resend (Option B in the Gmail amendment). Still the right answer for a weekly newsletter, not for this.
- Automatic bounce detection. Gmail gives no webhook. "Bounced" stays a button on the results page.
- Templates and journeys (v1.1 Phases 5 and 6), texting.

## Phase 1: safe to send (`comms-v3-safe`)

1. **Merge fields.** `{{first_name}}`, `{{last_name}}`, `{{full_name}}`, `{{last_gift_amount}}`, `{{last_gift_date}}`, `{{lifetime_total}}`, all from `v_fr_rollups`, which the audience already reads. Inline fallback in the Mailmeteor style: `{{first_name|there}}`. One pure function in `lib/comms/merge.ts`, used by the worker, the test send and the preview.
2. **Snapshot at queue time.** `email_sends` gets `merge jsonb` beside `first_name`. The email a donor gets is built from what was true when you pressed Send.
3. **Fail closed.** An unknown field (`{{frist_name}}`) blocks the send. A field with no fallback that is empty for anyone blocks the send and names how many. A gift field in an email going to people who never gave is a block, not a blank.
4. **The fallback line.** Before sending: "771 of 2,491 have no first name and will see 'Hi there,'." With the choice to leave them out.
5. **Stuck alarm at 15 minutes**, as above. The 24 hour alarm stays for the slow case.
6. **Worker trace.** One audit row per run that claims or finds waiting rows.
7. **List size.** Raise `MAX_RECIPIENTS` from 2,000 to 5,000. The daily cap already spreads a big send over days and says so before you confirm. The results page reads sends whole, so it gets paging in the same PR.
8. Migration (SQL for review, Remi applies): `email_sends.merge jsonb`, `email_campaigns.fallbacks jsonb`.

## Phase 2: the composer (`comms-v3-composer`)

One screen at `/admin/comms/emails/[id]/edit`. Drafts open into it. The inline form goes away.

- **Left, write.** Subject and body, autosaved. A row of merge field chips that insert at the cursor. Each chip shows how many people in the audience have that field.
- **Right, see.** The exact email for a real person in the audience, as Gmail shows it: from line, subject, body, footer. Previous and next step through people. A "show me the awkward ones" filter: no first name, never gave, longest name. Phone and desktop width. "Leave this person out of this email."
- **Top, who.** The audience builder that exists today, with its live count and the left-out line, opened in place.
- **Bottom, send.** Test to me. Send 5 samples to me (picked from the awkward ones, subject says which). Then Check and send: every blocker and warning on one page, the day-by-day spread at the cap, and a confirm button that repeats the count and the sending address.
- **Undo.** Over 25 people, the send waits 60 seconds with an Undo.
- **While it sends.** A progress line that updates each minute, and the red line when nothing has moved for 10 minutes.

Built from the BloomOS kit (`app/admin/_components/ui`), server components with small client islands, every write through the existing `/api/admin/comms` routes with `comms.send`.

## Phase 3: follow up (`comms-v3-follow-up`)

- On a finished campaign: "Write a follow-up to the 61 people who did not open or click." It makes a new draft whose audience is that fixed list of people, minus anyone who unsubscribed since.
- Opens stay labeled "about". A click counts as an open.
- The per-person results list gets filter chips: opened, clicked, did not open, left out.

## Definition of done

- A draft using `{{first_name|there}}` and `{{last_gift_amount}}` shows the right words for a donor with a name, a donor without one, and refuses to queue for someone who never gave.
- A typo in a field blocks the send with the field named.
- The preview for person N is byte for byte the email person N receives (one renderer, tested).
- Pausing the worker with a campaign open raises the alarm inside 16 minutes, and does not raise it when the org is at its cap.
- A 2,491 person send at a cap of 400 queues, tells you it takes 7 days before you confirm, and finishes with every row in a final state.
- Tests in `tests/comms-merge.test.ts`, `tests/comms-composer.test.ts`, and the existing comms suites stay green.

## Runbook for the first real send (no code, in this order)

1. Add a reply-to and put Remi and Shannon on the leadership copy list.
2. Send a real campaign through the queue to a staff-only audience (3 to 5 people). This is the first time the Ambition Angels Gmail queue carries anything.
3. Send to the 118 donors. Watch replies and bounces for a day. Mark bounces on the results page.
4. Then the wider list, a few hundred a day. 2,373 of these people have never given and many have never had an email from this account. Dead addresses and spam reports land on the Gmail account itself, the same one that sends your own mail.

## Failure modes to watch

1. **Reputation.** A cold list of 2,400 through a personal Workspace account is the real risk, more than any bug. The runbook order is the mitigation.
2. **"Hi friend,"** to 771 people. Phase 1 item 4.
3. **Preview drift.** Preview and send must share one renderer or the preview lies.
4. **The repo split.** `chore/aa-trim` removes BloomOS from this repo and `remi-sobo/bloomos` is still empty. Work started here during the split has to be carried across.
5. **Bigger results pages.** Lifting the cap without paging the results read would hit PostgREST's 1,000 row limit.

## Open decisions for Remi

- **A. Who is "all my donors and stuff"?** The 118 donors, or all 2,491. Recommendation: donors first, per the runbook.
- **B. Where to build.** Here on `main` now, or in `remi-sobo/bloomos` once the split lands. Recommendation: wait for the split if it lands this week; otherwise build here and carry it.
- **C. The 771 with no first name.** A fallback word, or leave them out of anything that opens with a name. Recommendation: "there", and fix names over time.
- **D. Daily cap.** Stay at 400, or raise it (the ceiling is 1,800). Recommendation: stay at 400 until two sends have gone cleanly.
