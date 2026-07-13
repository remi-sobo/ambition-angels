# Spec: /ms — "What Are You Built For" (middle school career game)

Owner: Remi Sobomehin
Build partner: Claude Code
Status: draft, awaiting approval
Target first run: Dreamforce student activation, ~23 students ages 11 to 14

---

## Problem statement

A 12 year old can name about nine jobs. Doctor, lawyer, athlete, YouTuber, teacher, cop, nurse, engineer, and whatever his uncle does. That short list is the ceiling on what he thinks his life can be, and nothing in his day is going to lengthen it.

Ambition Angels already fixes this for high schoolers. The app, the 30-day internship simulations, and the assessment on the main site are all built for 14 to 18. Below that age we have nothing, so a middle school partner, a Salesforce activation, or a parent with a sixth grader hits a wall.

We need a standalone, free, web-based game at a live URL that takes a middle schooler from "I have no idea" to "I now know about four jobs I couldn't have named this morning, and one of them is for me." It has to work alone on a phone at 9pm and it has to work in a room of 23 kids with one facilitator. And whatever the kid walks out with cannot get lost.

---

## The mechanic, plainly

This is the heart of the thing. Everything else serves it.

A student takes an eight minute assessment and gets back the ten careers that match how he is actually wired. He picks one he has never heard of and tells nobody.

**His phone shows him the day.** A 150-word first-person vignette of a real workday in that job. Sixty seconds to absorb it. Nobody else sees this. It is not performed, it is not read aloud, it is not guessed at. It exists so that he actually understands the job before he has to talk about it.

**Then he reads the clues out loud.** Eight facts about the job, the same eight for every job, ordered from vague to dead giveaway. He reads clue one. The table guesses. Wrong? He reads clue two. And so on.

**The fewer clues it takes, the better the round.** That is the whole game. A table that gets it off clue three feels like geniuses. A table that needs all eight just learned everything about a job, which was the point anyway. There is no way to lose.

Then he says the title, and the table finds out what they just figured out was called.

Four students at a table, four careers, four rounds.

---

## Locked decisions

These are settled. Do not reopen them during the build.

1. **Route is `/ms`.** Live, public, not in site nav. Shareable by link only.
2. **This is not the main assessment.** The `/assessment` flow stays exactly as it is, for high school and college. `/ms` is a separate surface with its own instrument, its own copy, its own design. No shared components except the trait model underneath.
3. **The vignette is private and silent.** It is the student's prep. He absorbs it in sixty seconds. He never reads it out loud and the table never hears it.
4. **The eight facts are the clues, read out loud, one at a time.** The table guesses off the facts. This is the game.
5. **The job title is never a fact.** It is the answer. It appears nowhere on the clue card.
6. **The eight facts are a ladder.** Vague to specific, in the same order, for every career, with no exceptions. Clue 1 should be hard. Clue 8 should be nearly impossible to miss.
7. **Career cards are pre-generated and human-reviewed. They are never generated live for a child.** AI writes the draft. A human approves it. The approved version is what a student sees.
8. **AI is used live in exactly two places:** the personalized "what you're built for" summary at the end of the assessment, and the facilitator's conversation prompts on the group screen. Nowhere else.
9. **No student account, no student login, no password.** A deck is claimed by a six-character code and lives at a permanent URL.
10. **No email is collected from a student under 13.** Adult email only. This is not a preference, it is COPPA.
11. **Launch with eight careers, not sixty.** The game gets better by writing more careers, not by writing more code.

---

## Scope

**In:**

- `/ms` landing page. One screen, one button, no marketing.
- A middle-school assessment instrument. 8 minutes, ~24 items, reading level grade 5.
- A results screen: your top 10 careers, with what each one pays sitting quietly next to it, not headlining it.
- **The Day:** a private 150-word first-person vignette with a 60-second absorb timer, that never names the job.
- **The Clues:** eight facts, same eight every role, ordered vague to giveaway, revealed one tap at a time.
- **The Answer:** the job title.
- Solo mode: take it, explore your ten, build your deck, save it.
- Group mode: a facilitator opens a room, students join with a room code, everyone plays, one screen shows the room.
- The Deck: a permanent, no-login page holding every career a student explored, reachable by a six-character claim code.
- Adult handoff: an adult (facilitator, parent, teacher, mentor) can receive the deck by email, plus the Ambition app code.
- Eight career cards written, reviewed, and live at launch. Two each across business, tech, health, creative.

**Out:**

- Any change to `/assessment`, the app, or the Adult Guide dashboard. This is additive only.
- Student accounts, logins, or passwords.
- Branching "make a decision" gameplay inside the day. The vignette is linear prose. That was a different design and it costs an engine we do not need.
- Scoring, points, leaderboards, streaks. "How few clues did it take" is enough tension. Nobody loses.
- The Steal, the Money Round, Two Truths and a Job. Good mechanics, parked, not v1.
- Real-time multiplayer sync between phones. Group mode is a shared room code and a shared screen, not a synced game state.
- Payments, scheduling, or anything that touches BloomOS.

---

## The card schema

Every career is one row. Three parts.

### Part one: THE DAY (private, 60 seconds, silent)

~150 words. First person, present tense, plain. Six to eight beats of a real workday with times on them. Names no job, no industry, no employer, no credential. Written at a grade 5 reading level.

Its only job is to make the student understand the work before he has to talk about it. If he can answer a table's yes-or-no questions after reading it, it worked.

### Part two: THE CLUES (read out loud, one at a time)

Eight facts, the same eight for every career, in this order. The ladder runs from abstract to obvious.

1. **The problem I solve.** Why anyone pays for this at all. Hardest clue. Should apply to a dozen jobs.
2. **What I actually do all day.** One sentence, no jargon, no tool names.
3. **Three skills that matter.** The real ones, not "hard work."
4. **Who is counting on me.** Who is worse off if I do this badly today.
5. **Where I work.** Industry and setting. Hospital, studio, warehouse, office, outside.
6. **How you get here.** The honest path, including the ones that skip a four-year degree when they exist.
7. **What it pays.** Starting and experienced. Real BLS figures, source stored on the row.
8. **The thing nobody knows.** The near-giveaway. Also the fact that makes a kid say "wait, WHAT."

### Part three: THE ANSWER

The job title. One word or two. That is it.

---

## Worked example (this is the format, build to it)

**THE DAY** *(private, 60 seconds, nobody else sees this)*

> I get to work at 6:15 and change clothes before anyone else is in the room. My first job is the count. Every tool, every sponge, every needle, laid out in the order they will be needed, and I count them out loud while someone else listens. At 7:40 the person we are helping comes in, already asleep. I have my table ready before anyone asks. For the next three hours I stand two feet from the person doing the work and I put things in their hand before they ask for them, because if I am fast, they never have to look up. At 11:05 something starts bleeding that was not supposed to. Nobody panics. I already have the clamp in my hand. At 12:30 we count everything again. The number has to match. It always has to match.

**THE CLUES** *(read out loud, one at a time, table guesses after any of them)*

1. **The problem I solve:** Some work is too fast and too important for one person to do alone. Somebody has to stay one step ahead of it.
2. **What I actually do all day:** I hand the right thing to the right person at the exact second they need it, before they ask.
3. **Three skills that matter:** Calm hands. A memory for order. Standing still and focused for six hours.
4. **Who is counting on me:** The person on the table, and the person doing the work who cannot look away from them.
5. **Where I work:** Healthcare. Hospitals, surgery centers, trauma units.
6. **How you get here:** A 12 to 24 month program at a community college. No four-year degree. You can be working at 20.
7. **What it pays:** About $50,000 starting. Around $80,000 with experience, more on nights and trauma.
8. **The thing nobody knows:** If the count at the end does not match the count at the start, nobody leaves the room. Not the doctor. Not the patient. My count is the last word.

**THE ANSWER:** Surgical Technologist

Notice what clue 1 does and does not do. It is true, it is real, and it could be forty different jobs. Notice that clue 5 narrows it hard and clue 8 basically hands it over. That is the ladder. Every card gets built to that shape or it does not ship.

---

## The eight careers at launch

Two per field. At least five of the eight must be jobs a 12 year old cannot define, or the game has nothing to reveal.

| Field | Known anchor | The invisible one |
|---|---|---|
| Health | Registered Nurse | Surgical Technologist |
| Tech | Software Engineer | UX Researcher |
| Business | Marketing Manager | Supply Chain Analyst |
| Creative | Graphic Designer | Industrial Designer |

---

## Game flow

### Solo (one kid, one phone, no adult)

```
/ms
  → "Find out what you're built for." One button. 8 minutes.
  → Assessment. 24 items. One per screen.
  → "Here is what you're built for." AI summary, 3 sentences, second person, strengths only.
  → Your ten careers. Ranked. Pay shown small and gray, not big and green.
  → Tap any career → THE DAY (60s timer, then it just stops, it never locks him out)
  → THE CLUES, revealed one tap at a time. He can guess out loud to nobody, or to his mom.
  → THE ANSWER.
  → Card flips into his deck.
  → Explore as many as he wants.
  → THE DECK. His six-character code. Biggest type on the page. "Write this down."
  → "Send it to a grown-up" → adult email → deck + Ambition app code
```

Solo mode is quieter than group mode and that is fine. It is a collection loop, not a party game. The deck is what pulls him back.

### Group (23 kids, 4 tables, 1 facilitator, 30 minutes)

```
0:00  Facilitator opens /ms/host → ROOM CODE up on the screen
0:02  Students go to /ms, tap "I have a room code," join
0:03  Everyone takes the assessment on their own device
0:11  Results land. Room screen fills with names, not results. Those are theirs.
0:12  "Pick one career from your ten you have never heard of. Tell nobody."
0:13  THE DAY. Sixty seconds, heads down, silent. This is the only quiet minute in the room.
0:14  Random tables of four, assigned by the room screen. Not by interest. Never by interest.
0:15  Round 1. Student reads clue 1 out loud. Table guesses. Wrong? Clue 2.
      Table may ask three yes-or-no questions at any point. He can answer, because he read the day.
      On a correct guess, he reads the rest of the clues anyway. Everybody learns the job.
      Then: THE ANSWER.
0:18  Round 2. 0:21 Round 3. 0:24 Round 4.
0:27  Room screen closes with all 23 careers explored in that room, on one wall.
0:30  Every deck goes to the facilitator's inbox in one file, with app codes.
```

The room screen is the Adult Guide dashboard in miniature. A facilitator walks out with the career results of every kid she brought, plus AI-written conversation prompts for each one. That is the free sample of the paid thing.

---

## Architecture sketch

Next.js 14 App Router, TypeScript strict, Tailwind, Supabase, Resend. Same stack as the rest of the site. No new dependencies.

```
app/ms/
  page.tsx                    landing + join-with-room-code
  assess/page.tsx             the wizard
  results/[session]/page.tsx  ten careers
  card/[session]/[career]/    THE DAY → THE CLUES (one at a time) → THE ANSWER
  deck/[code]/page.tsx        the permanent deck. no auth. this is the artifact.
  host/page.tsx               facilitator: open a room
  room/[room]/page.tsx        the projected room screen

app/api/ms/
  summary/route.ts            live Claude call: 3-sentence "what you're built for"
  prompts/route.ts            live Claude call: facilitator conversation prompts
  deliver/route.ts            Resend: deck + app code to an adult email

Supabase (new tables, prefix ms_ so they never collide with the app)
  ms_careers            id, field, title, day_vignette,
                        clue_1 .. clue_8,
                        pay_low, pay_high, pay_source,
                        reviewed_by, reviewed_at
  ms_sessions           id, claim_code (6 char), trait_scores jsonb,
                        top_ten jsonb, summary_text, room_id nullable, created_at
  ms_explored           session_id, career_id, clues_used int, created_at
  ms_rooms              id, room_code (4 char), host_email, table_assignments jsonb,
                        created_at, expires_at
  ms_deliveries         session_id, adult_email, sent_at, app_code
```

`clues_used` is worth storing. It is the only number that tells us whether the ladder is calibrated. If every table is guessing off clue 2, clue 1 is too easy and the cards need a rewrite.

**RLS is on from day one on all five tables.** We do not repeat the backlog we already have. Public read on `ms_careers`, approved rows only, and **`title` and `clue_8` are never sent to the client until the student taps for them.** Everything else is service-role write, anon read scoped by code.

---

## Staged build order

**Phase 0 — Recon. Read and report. No code.**
Read the live repo and report back before anything else: how `/assessment` is built today, what the trait model actually is and where it lives, what the scoring function looks like, whether there is an existing careers table we should read instead of creating one, what the Resend setup is, and whether app-code generation exists for a user with no account. Report findings and any conflict with this spec. **Gate: Remi reads the recon and says go.**

**Phase 1 — Content, not code.** Write all eight career cards to the standard of the worked example. AI drafts, Remi edits, Remi approves. Every pay figure carries a BLS source. Seed `ms_careers`. **Gate: read the eight clue ladders cold to someone who has not seen them. If they get it off clue 1, the ladder is broken.**

**Phase 2 — The solo spine.** `/ms` landing, the 24-item wizard, trait scoring, the ten careers. No cards, no deck, no AI yet. Just: a kid can take it and see his ten. **Gate: Remi takes it on his phone and the result feels true.**

**Phase 3 — The card.** THE DAY with the 60-second timer, THE CLUES one tap at a time, THE ANSWER, add-to-deck. This is the game. **Gate: play one full round out loud with four real middle schoolers. Watch which clue they guess on.**

**Phase 4 — The deck.** Claim code, permanent no-login deck page, adult email delivery, app code. This is the "it can't get lost" phase. **Gate: close the tab, open the code on another device, deck is there.**

**Phase 5 — The room.** Host screen, room code, random table assignment, projected room screen, one-file delivery to the facilitator, AI conversation prompts. **Gate: dry run with 20 fake sessions before it ever sees a real classroom.**

**Phase 6 — The AI summary.** Three sentences, second person, strengths only. Last, on purpose. Most delightful, least load-bearing.

One PR per phase. Small and reversible. Migrations by hand in the Supabase SQL editor, never auto-applied on merge.

---

## Definition of done

- A 12 year old with a phone and a link goes from `/ms` to a saved deck in under 15 minutes with no adult, no login, and no email address.
- He closes the tab, comes back a week later on a different device with only a six-character code, and his deck is still there.
- A facilitator runs 23 students through the full game in 30 minutes with one room code and one projected screen.
- Across a real playtest, the median guess lands somewhere around clue 4 or 5. Not clue 1. Not clue 8.
- Every one of the eight cards has been read cold to someone who has not seen it, and the ladder held.
- Every pay figure resolves to a BLS source stored on the row.
- No email address belonging to a person under 13 exists anywhere in the database.
- RLS is on for all five `ms_` tables, and the job title never reaches the client before the student taps for it.
- The Salesforce activation runs start to finish with no laptop open backstage.

---

## Failure modes to watch for

**The ladder is broken and clue 1 gives it away.** A student reads "I solve problems for people who are sick" and the table shouts it in four seconds. The round is over before it started and three kids just learned nothing. Manifests as rounds ending instantly and the room going flat. Mitigation: clue 1 gets written to be true of at least a dozen jobs. Every card is read cold to a stranger before it ships. `clues_used` gets watched after the first real session.

**Nobody ever gets it and the table gives up.** The opposite failure. Eight clues in and four kids are just sitting there. Manifests as a shrug. Mitigation: clue 8 is written to be nearly impossible to miss, and the three yes-or-no questions are always available. A table can always get there.

**The student cannot answer the table's questions.** He read the day too fast, absorbed nothing, and now he cannot say whether he works inside. Manifests as him going quiet and the round dying. Mitigation: the timer stops, it never locks. He can pull the day back up at any point. He is never cut off from it.

**The AI summary says something a 12 year old carries around.** "You're not a details person" lands differently on an 11 year old than on a 25 year old. Manifests quietly and we never hear about it. Mitigation: strengths-only by construction, the system prompt forbids deficit language, no free text from a child ever reaches the model, and ten sample outputs get reviewed before it goes live.

**COPPA.** We collect an email from a 12 year old because the flow made it the easy path. Manifests as a legal problem, a partner problem, and a Salesforce problem, in that order. Mitigation: there is no field anywhere in this product where a student can enter an email. The only email field in the whole thing sits behind a screen that says this is for a grown-up.

**The room dies at minute 11.** Twenty three kids finish the assessment at wildly different speeds and the fast ones sit for six minutes doing nothing. Manifests as chaos. Mitigation: fast finishers go straight into exploring a second and third career from their ten while they wait. There is always another card.

**We build the engine we said we would not build.** Somebody decides the day would be better with branching choices. It would be. It also triples the cost per career and we launch with two instead of eight. Manifests as a slipped date. Mitigation: it is in the Out list. It stays there.

---

## Design direction

This should look nothing like `/assessment`. That page is built for a 17 year old thinking about college. This is built for a 12 year old who thinks career stuff is boring and adult stuff is fake. It cannot be cute and it cannot be corporate. Both read as condescending to a seventh grader.

**The idea: the clue is a physical object.** Everything else on the page is quiet and flat so the clue can be the one loud thing. It is the signature element and the only place we spend boldness.

- **THE DAY** is heavy, dark, full-bleed on mobile. Set large. A hairline timer bar across the top that empties and then simply stops. Nothing flashes, nothing buzzes. This screen is silent and it should feel silent.
- **THE CLUES** is the money screen. One clue on screen at a time, set big enough to read out loud across a noisy table. The clue number is enormous. The remaining clues sit below as locked slots, so a kid can see how many he has left to burn. That visible countdown is the tension.
- **The tap** that reveals the next clue is the one interaction in the product that should feel good. A real weight to it. Respect `prefers-reduced-motion`.
- **THE ANSWER** is a full-screen card turn. 400ms. The title lands and it is the largest type in the whole product.
- **Pay is clue 7.** Same type as the other seven. Not bigger, not green, not a callout. It is there, it is real, it is not the point.
- **The deck** is a wall of cards he collected, each showing how few clues it took. The claim code is the largest type on that page.

Type: a display face with weight and personality for the clue card, something you would not put on a nonprofit brochure. Body face set larger than an adult site would ever set it, because this text is going to be read aloud in a loud room.

No emoji. No confetti. No streaks. No mascot. A 13 year old can smell an adult trying to be fun from across the room.

---

## Open items before Phase 0

- Reading level pass on the assessment items. The current instrument is written for 16 year olds and the vocabulary will not survive a sixth grader.
- Ambition app code generation: does it exist today, and can we issue a code for a user with no account.
- Devices at Dreamforce. Salesforce provides, or we bring. Ask now, not in September.
