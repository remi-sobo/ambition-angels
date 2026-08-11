# Spec: Teen games on /ms (hub + first three)

Status: approved, in build
Scope: one hub page, three new games, zero changes to the existing middle-school game
Estimated: 6 to 8 weeks of build across five phases, each independently shippable

**Amendment 1 (2026-08-11, Remi):** the hub route is `/teens`, not `/games`.
Everywhere this spec says `/games`, read `/teens`; the existing game lives at
`/teens/built-for`. Everything else in locked decision 1 stands: `/ms` and
`/ms/*` 308-redirect to the new routes, and no code namespace moves —
`lib/ms/`, `app/api/ms/`, and the `ms_*` tables keep their names.

**Phase 0 findings (2026-08-11):** recon report delivered in-session; the
numbers that drive the build order: 774 occupations imported, 745 with
non-null pay median and a usable description, 48 cards drafted, **27
approved** (public 7, creative 5, business 5, health 5, trades 3, tech 2).
27 is far under the 200-card gate, so Never Heard of It stays behind Higher
Wage and needs a card-approval push before Phase 4. Phase 2 shipped with
this amendment.

---

## Problem statement

A 16-year-old at a Title I school can name about eight jobs. The ones her parents do, the ones on TV, and teacher. Ambition Angels has 900 real occupations with real pay, real education paths, and human-approved vignettes sitting in a database, and the only way a teen currently touches any of it is by starting a 30-day internship. That is a large commitment for someone who does not yet know what she is committing to. There is no front door. There is nothing a kid plays for ninety seconds at 9pm and then sends to a friend, and there is nothing a teacher can put on a projector on a Tuesday that costs her no prep.

We already have the hard part built. The career library, the deterministic RIASEC scorer, the clue-reveal mechanic, the claim code, and the room infrastructure all exist and all work. What is missing is the shelf they sit on and three cheap games pointed at teenagers.

---

## Locked decisions

**1. Route: `/games` is canonical, `/ms` redirects to it.**
This is the one place I am pushing back on the instruction, and it is a single line of config if you disagree. Everything else in this spec is unchanged either way. The reason: teens read URLs on links their friends send them, and `/ms` reads as "middle school." The existing game moves to `/games/built-for` and `/ms` gets a permanent redirect to `/games`, so every card, flyer, and email already in circulation keeps working. The code namespace stays exactly where it is. No renaming of `lib/ms/`, `app/api/ms/`, or any table. This is a URL decision, not a refactor.

**2. The existing game sits on top, full width, and is labeled honestly.**
"What Are You Built For" is the hero of the hub. Below it, a three-card grid for the new games. Each card carries a small age tag: Grades 6-8 on Built For, Ages 14-18 on the other three. A 16-year-old who starts an eight-minute assessment written at a grade 5 reading level and feels talked down to is a user we lose permanently. Tell her which one is hers.

**3. No AI in any of the three new games in v1.**
Higher Wage, Never Heard of It, and The Cut make zero model calls at play time. Every number, every clue, every fact comes out of the vetted tables. Guess matching is deterministic string comparison, not a model. This keeps the trust story clean, keeps latency at zero, and keeps cost at zero. The AI-judged concepts (Pitch It, Talk Your Way In) are real and they are next, but they need a moderation pass and a cost model, and I do not want that on the critical path for the first teen launch.

**4. No accounts, and no new persistence primitive.**
All three new games store state in `localStorage` only: streaks, best streaks, daily history. The six-character claim code stays exactly what it is today, the artifact that saves a Built For deck. A single cross-game player code is genuinely valuable and it is explicitly v2.

**5. Cards and pay data are read-only to these games.**
No game writes to `ms_occupations` or the card tables. No game triggers generation. The only new writes are a daily calendar table and, for The Cut, ephemeral room state that expires with the room.

**6. The hub and the three games are indexable. Room screens are not.**
`/ms` is `noindex` today because it was an unlisted pilot. Share-driven growth needs the opposite. Hub and game pages get indexed and get Open Graph images. Facilitator and room screens stay `noindex` for the same reason they are today.

---

## Scope

**In:**

- A hub page at `/games` listing four games, existing one first
- `/ms` permanent redirect, existing game relocated to `/games/built-for` with no behavior change
- Higher Wage: two-card pay comparison, endless streak, share card
- Never Heard of It: one career per day, eight-clue ladder, guess box, streak, Wordle-shaped share block
- The Cut: six careers, rotating rule deck, class votes on phones, projector board, solo mode on the same board
- A curated play pool with a human approval step before any occupation appears in a game
- A daily calendar surface in `/admin` so you schedule the job of the day yourself
- Open Graph share images per game

**Out:**

- Any live model call inside a game
- Accounts, logins, student email, student free text of any kind
- Cross-game claim codes or a unified player record
- Leaderboards, friend graphs, notifications
- The other nine concepts from the brainstorm
- Any change to the Built For assessment, scorer, instrument, or results page
- Native apps, offline mode, PWA install prompts

---

## Architecture sketch

**Data, all existing and all read-only to the games:**

`ms_occupations` holds SOC code, title, title variants, description, tasks, job zone, pay median, pay p90, pay as-of, typical education. The approved card table holds the vignette and clues 1 through 8, where clues 6 and 7 are rendered from the pay and education fields by `lib/ms/render.ts` and never written by a model.

**One new table, `game_pool`:** SOC code, eligible flag, per-game flags, a short reveal line, a human-approved timestamp. This is the gate between the 900 imported occupations and anything a teen sees. An occupation is not playable until a row here says it is. It exists because the raw import contains catch-all SOC codes ("Managers, All Other"), duplicate near-titles, and occupations with null pay, none of which make a fair round.

**One new table, `game_daily`:** date, game key, SOC code. Pre-scheduled by you in `/admin`, at least thirty days ahead. Nothing about the daily game is random at runtime, which means nothing about it can surprise you on a Monday morning.

**Flow, Higher Wage:** client requests a pair from `/api/games/higher-wage/pair` with the current streak. Server reads `game_pool` joined to `ms_occupations`, picks two rows satisfying the gap rule for that streak level, returns titles, reveal lines, and a signed pair token. Client shows two cards. On tap, client posts the token and the choice, server returns both real pay figures and whether the pick was right. Pay never reaches the browser before the tap. Streak lives in `localStorage`.

**Flow, Never Heard of It:** client requests today from `/api/games/daily`. Server reads `game_daily` for the current date in America/Los_Angeles, joins the approved card, returns clue 1 only plus the accepted-answer hash set. Each subsequent clue is a fetch. Guesses are matched client-side against normalized title and variants using the same normalization the server uses, so a wrong guess costs no round trip. Reveal is a server fetch that returns title, vignette, pay, education, and outlook. Clue count and history in `localStorage`.

**Flow, The Cut:** reuses `lib/ms/claim.ts` room codes and the existing room and host-token pattern. Facilitator opens a room, gets a 4-character code, projects the board. Server picks six careers from one field and deals a rule from a fixed deck of twelve, every rule computed from a column that already exists. Students join, tap a career, server tallies. On resolve, server reveals the correct cut, decrements the shared lives if the room was wrong, and deals the next rule against the survivors. When one career remains, the projector renders its full card for the facilitator to read aloud. Room state is ephemeral and expires with the room, same as today.

**Shared:** one `lib/games/pool.ts` for eligibility and selection, one `lib/games/share.ts` for the OG images and share strings, and the existing per-IP rate limiter on every route.

---

## Staged build order

**Phase 0: Reconnaissance. Read and report only. No code, no migrations.**
Report back, in writing, before anything is built:

1. Exact table and column names for occupations, cards, sessions, rooms, and room players
2. How many cards are approved right now, broken out by field
3. How many occupations have a non-null pay median, and how many of those have a usable one-line description
4. Where the `/ms` route files live, and exactly how the room host token is issued and checked
5. Whether any cron or scheduled-job surface already exists, or whether the daily needs one
6. Current `noindex` and robots configuration on `/ms`
7. The rate limiter helper: location, signature, and current per-route settings

Gate: I do not write a line of Phase 1 until this report exists and you have read it. If the approved card count comes back under 200, Never Heard of It moves behind Higher Wage in the order and we plan a card-approval push instead.

**Phase 1: The pool.** Build `game_pool`, the eligibility rules, and a review screen in `/admin` where you flip occupations to eligible and write or approve the one-line reveal. Ship with 300 approved occupations. Commit point.

**Phase 2: The hub.** `/games` page, `/ms` redirect, Built For relocated to `/games/built-for` with zero behavior change, three placeholder cards marked coming soon. Commit point. This ships to production on its own, before any new game exists.

**Phase 3: Higher Wage.** The full game, streak, share card, OG image. Commit point and public launch.

**Phase 4: Never Heard of It.** `game_daily`, the admin scheduler, the clue ladder, guess matching, the share block, the streak. Commit point and public launch.

**Phase 5: The Cut.** Rule deck, room board, projector view, phone voting, solo mode. Commit point and launch to facilitators before it goes on the hub.

---

## Definition of done, per phase

**Phase 1.** Every row in `game_pool` marked eligible has a non-null pay median, a title that is not a SOC catch-all, and a reveal line you personally approved. A query proves it. No occupation reaches a game without passing through this table.

**Phase 2.** `ambitionangels.org/ms` returns a 308 to `/games`. Every existing Built For entry point still works, including a live room code mid-session. The hub loads and is interactive on a phone in under two seconds on a throttled 4G profile. Built For is visually the primary element on the page.

**Phase 3.** A teen taps once and is in a round within one second of the page painting. Median pay for either card is not present anywhere in the network response until after the tap, which a network log confirms. A 20-round streak has shown 40 distinct occupations with no repeat. The share card renders correctly in an iMessage preview. Zero model calls, which the AI ledger confirms.

**Phase 4.** Two devices in different states, opened at the same moment, get the same job. The day rolls over at midnight Pacific and not at UTC. A correct guess with a plausible variant ("EMT" for "Emergency Medical Technician") is accepted. Giving up still shows the full reveal. The share block pastes into a group chat as eight readable squares with no image.

**Phase 5.** A facilitator opens a room, projects it, and 25 phones join and vote inside three minutes with no login and no app. The room survives one student refreshing mid-vote. The survivor card is readable from the back of a classroom. Nobody's screen ever displays the word "wrong" pointed at an individual student.

---

## Failure modes to watch for

**The pool is boring and the game is unfair.** If eligibility is a SQL filter and nothing else, Higher Wage will serve "Cardiothoracic Surgeon vs. Fast Food Cook" and a teen will quit in four rounds because the game is insulting. It manifests as a session length under 60 seconds. The mitigation is Phase 1 existing at all: a human-curated pool, and a gap rule that starts wide and tightens rather than one that samples uniformly.

**The daily job is a job nobody could ever get.** If the calendar drifts toward interesting-to-adults occupations, the reveal lands as "here is a thing you will never be" rather than "here is a thing you could do." It manifests as daily streaks that die on day three. The mitigation is a scheduling rule enforced in the admin screen: at least three of every seven daily jobs have a job zone of 3 or lower, meaning no four-year degree.

**Pay leaks to the client before the tap.** Any teen who opens DevTools once and posts about it costs the game its credibility. It manifests as a screenshot. The mitigation is the signed pair token and a test in CI that asserts the pre-tap response body contains no pay field.

**The Cut turns into a room where 25 kids watch three kids play.** Group games fail quietly when the projector is the game and the phones are decoration. It manifests as a facilitator who runs it once and does not run it again. The mitigation is that the round cannot resolve until a quorum of joined phones has voted, and the tally shows on the projector before the answer does.

**The redirect breaks a live classroom.** If `/ms` 308s while a facilitator has a room open on a projector, we have broken a lesson in progress. The mitigation is shipping the redirect on a Friday afternoon, keeping the old route as a 200 for two weeks with a banner before it flips to a redirect, and testing an active room across the change.

**A teen sends the game to a friend and the friend lands on a middle-school assessment.** The hub is the fix, but only if the share cards from the three new games deep-link to those games and not to the hub. It manifests as high share clicks and low play starts on the shared game.

**Scope creep through the leaderboard door.** Every one of these games has an obvious leaderboard, and a leaderboard needs identity, and identity needs accounts. It manifests as a conversation that starts with "it would be cool if." The answer is no, and the reason is that the constraint is the product.

---

## Open questions, none blocking

1. Does the hub carry a persistent, quiet path into the Ambition app, or does it stay a pure game surface with one link in the footer? My instinct is the quiet path, but that is your call and it does not change the build.
2. Do you want daily email to a facilitator with yesterday's room results, or is that scope we deliberately never add?
