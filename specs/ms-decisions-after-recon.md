# /ms — Decisions after Phase 0 recon

Amends `specs/ms-career-game.md`. Where this doc and the spec disagree, this doc wins.
Recon accepted. The trait model does not exist and must be built. Everything below follows from that.

---

## D1. Locked decision 2 is rewritten

**Old:** "No shared components except the trait model underneath."
**New:** `/ms` shares nothing with the existing career quiz. It gets its own instrument, its own trait model, its own scorer, and its own career catalog. The existing modal on `/` and `/curriculum` is not touched.

The trait model is **content**, not code. It gets authored and reviewed in Phase 1, alongside the cards.

## D2. The trait model

Six dimensions. Tap-only. No free text ever reaches the model or the database.

| # | Trait | What it means to a 12 year old |
|---|---|---|
| 1 | **Build** | You like making a real thing exist and watching it work. |
| 2 | **Analyze** | You like figuring out why something is happening. |
| 3 | **Help** | You like being the person someone needs. |
| 4 | **Create** | You like making something that did not exist before. |
| 5 | **Organize** | You like order, plans, and knowing where everything is. |
| 6 | **Lead** | You like deciding, convincing, and being responsible for it. |

## D3. The scorer

Deterministic dot product. No LLM in the matching path, ever. This follows from locked decision 7 and it is non-negotiable for an under-13 audience.

Each career carries a 6-value weight vector on its `ms_careers` row, 0 to 5. The student's assessment produces a 6-value trait vector. **Normalize both to unit length before the dot product**, or careers with big weight vectors win every time regardless of the student.

Draft weight matrix. Remi reviews these like he reviews the cards, because they are the same kind of thing.

| Career | Build | Analyze | Help | Create | Organize | Lead |
|---|---|---|---|---|---|---|
| Surgical Technologist | 3 | 2 | 5 | 0 | 5 | 1 |
| Registered Nurse | 1 | 3 | 5 | 1 | 4 | 3 |
| UX Researcher | 1 | 5 | 4 | 3 | 3 | 2 |
| Software Developer | 5 | 5 | 1 | 3 | 3 | 1 |
| Supply Chain Analyst | 1 | 5 | 1 | 1 | 5 | 3 |
| Marketing Manager | 1 | 4 | 2 | 4 | 3 | 5 |
| Industrial Designer | 5 | 3 | 1 | 5 | 2 | 2 |
| Graphic Designer | 2 | 1 | 2 | 5 | 2 | 1 |

**Sanity gate for Phase 1:** hand-build three fake students (a helper, a builder, a leader). Run them through the scorer. If the helper does not surface Surgical Technologist or RN in the top two, the weights are wrong, not the student.

## D4. "Top ten" is dead

Eight careers in the catalog. Rank all eight, show all eight. The ranking *is* the result.

- `ms_sessions.top_ten` → **`ms_sessions.ranked_careers`** (jsonb, ordered array of career ids with scores).
- Results screen copy: "Here are your eight, ranked by how you're actually wired." Not "your top ten."

## D5. Table dedup is a constraint, not a hope *(new, and it matters)*

With an eight-career catalog, two students at the same table can pick the same career. That round is dead. Nobody guesses a job they just heard three minutes ago.

**The room screen assigns each student a career, deduplicated within the table.** Greedy assignment: walk the table, give each student the highest-ranked career from their own list that nobody else at that table already has. Four students, four distinct careers, every one of them still a personal match.

The student still gets a choice, but it is a choice among careers that keep the table distinct. If that is not possible, the room screen resolves it and the student is told which one is his.

Solo mode has no dedup problem. He explores whatever he wants.

## D6. App code is an open question, not a deliverable

The Ambition app is a separate codebase. This repo cannot mint a redeemable code for it.

**v1 ships store links,** exactly as `app/api/quiz-submit/route.ts` does today. `ms_deliveries.app_code` stays on the schema as a nullable column so a real code is an additive change later. **Phase 4 does not block on the app team.**

## D7. Migrations follow the repo, not the spec

The spec said Supabase SQL editor. The repo has moved past that and the repo is right. Follow the house workflow:

- One idempotent migration file per phase in `supabase/migrations/`. `if not exists` on every create.
- Append the filename to the ordered list in `scripts/test-rls.sh`.
- Assert `ms_` policies in `supabase/tests/rls-leak-test.sql`.
- **No `org_id` on any `ms_` table.** These are public-product tables, not tenant data. The tenant ratchet will fail the build otherwise.
- Apply to production through the `db-migrate.yml` action. Never the SQL editor.

## D8. The answer is withheld structurally

Accepted as recommended, and it is better than what the spec said.

- Anon reads a **view** of `ms_careers` that excludes `title` and `clue_8`. Column-level hiding is not something an RLS policy can do, so it does not get to be a policy problem.
- The reveal goes through a **route handler**, and that handler writes the `ms_explored` row with `clues_used` in the same call.
- Consequence: **you cannot get the answer without telling us which clue you were on.** The calibration metric becomes un-skippable rather than a thing we remember to log.

## D9. The instrument is a from-scratch write

Not a vocabulary pass. The current instrument has five free-text essay boxes, which is the wrong format for an eleven year old and also a direct violation of "no free text from a child reaches the model."

24 items. One per screen. Tap-only. Grade 5. Same review bar as the cards.

## D10. Kill `/api/career-quiz`

Uncalled, unauthenticated, forwards an arbitrary client prompt to the model on our API key. **Separate PR, this week, before any `/ms` work.** It is not part of this project and it should not wait for this project.

---

## Amended build order

**Phase 1 — Content.** Eight cards (drafted, in `ms-career-cards-v1.md`). The 24-item instrument. The six-trait model. The 8×6 weight matrix. Verify the Supply Chain Analyst pay figure against BLS. Seed `ms_careers`.
*Gate: read the clue ladders cold to a stranger. Run three fake students through the scorer by hand.*

**Phase 2 — The solo spine.** `/ms`, the wizard, the deterministic scorer, the eight ranked careers.
*Gate: Remi takes it on his phone and the ranking feels true.*

**Phase 3 — The card.** THE DAY, the clue ladder, the reveal through the route handler, `clues_used` written.
*Gate: play a full round with four real middle schoolers. Watch which clue they guess on.*

**Phase 4 — The deck.** Claim code, permanent no-login deck page, adult email, store links.
*Gate: close the tab, open the code on another device, deck is there.*

**Phase 5 — The room.** Host screen, room code, table assignment with career dedup, projected room screen, facilitator delivery.
*Gate: dry run with 20 fake sessions.*

**Phase 6 — The AI summary.** Three sentences, strengths only, from the trait vector. Last.

---

## Carried out of scope, needs its own decision

**The existing career quiz has an "Under 16" age option, collects an email, and has no COPPA gate.** 47 submissions in production. This is a live exposure on the main site, unrelated to `/ms`, and it is the kind of thing a corporate philanthropy legal review finds. Needs a decision from Remi, separately and soon.
