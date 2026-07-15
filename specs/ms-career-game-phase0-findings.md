# /ms Career Game — Phase 0 Recon Findings

Read-only recon of the live repo (`remi-sobo/ambition-angels`) and the live Supabase project (`Ambition-Angels`, ref `kzzdtibbwsucloaoqpqa`), against `specs/ms-career-game.md` and `specs/ms-career-cards-v1.md`. No code written, no migrations, no branches.

The one-line version: **the spec assumes an assessment engine that does not exist.** There is no `/assessment` route, no trait model, no scoring function, and no careers table. The live "assessment" is a modal quiz whose matching is a single free-form Claude call. Almost everything under `/ms` gets built new — which the spec's staging mostly already anticipates, but Phase 2 is bigger than written and locked decision 2 rests on a false premise.

---

## 1. The existing assessment

### `/assessment` does not exist

There is no `app/assessment/` directory and no route by that name. What exists is **`components/CareerQuizModal.tsx`** — a client-side modal ("Career Discovery") mounted in exactly two places:

- `app/page.tsx:5,56` (homepage)
- `app/curriculum/page.tsx:6,273`

It is a modal, not a page. State is a single `useState` object inside the component (`components/CareerQuizModal.tsx:74-82`); close the modal and everything is gone. There is no wizard framework, no persistence mid-quiz, no URL state.

### The trait model — does not exist as a model

The only thing called "traits" is four self-rated 1–5 bubbles, defined inline in the JSX (`components/CareerQuizModal.tsx:467`):

```tsx
{[["creative","Creative"],["problemsolver","Loves solving problems"],["peopleperson","Good with people"],["leader","Likes being in charge"]].map(([trait, label]) => (
```

They are stored as `traits: Record<string, number>` and never scored — they are serialized into a prompt string, nothing more. There is no trait taxonomy, no dimensions file, no shared model that `/ms` could sit on top of.

### The scoring function — does not exist

Matching is one LLM call. `app/api/career-match/route.ts` builds a prose prompt from all answers and asks the model for the answer directly:

```ts
// app/api/career-match/route.ts:37
"You are an elite career coach. Read this person deeply and return the 10 most personally resonant career matches. ..."
// :52
"Personality: creative " + (answers.traits.creative || "?") + "/5, problem solver " + ... 
// :91-93
const { text } = await generateText({ prompt, tier: "fast", maxTokens: 1500 });
const raw = text.replace(/```json|```/g, "").trim();
const careers = JSON.parse(raw);
```

`generateText` lives in `lib/ai/gateway.ts`; `tier: "fast"` maps to `claude-sonnet-4-6` (`lib/ai/gateway.ts:33-36`). Rate limiting is per-IP, in-memory, per-serverless-instance (`lib/rate-limit.ts` — explicitly "sufficient deterrent for casual abuse, not a defense against a distributed attacker").

There is **no deterministic trait→career math anywhere in the codebase.** The client has a hardcoded 10-career `getFallback()` list (`components/CareerQuizModal.tsx:52-65`) for when the API fails. That is the entire non-AI matching logic in existence.

### The items

Hardcoded in JSX inside `CareerQuizModal.tsx`. Six sections, **15 questions plus a bonus** (not 24): 4 multiple-choice, 4 chip multi-selects, 1 slider, 4 traits bubbles, and **5 free-text textareas** (free time, flow state, good at, people-come-to-you-for, dream day, future self). Reading level is conversational teen-directed prose — fine for 16, but the instrument leans hard on written self-expression ("Describe your dream work day"), which is exactly what a grade-5 instrument can't do. The spec's "reading level pass" framing undersells it: it's not a vocabulary edit, it's a different item format.

One more thing found here: **`app/api/career-quiz/route.ts` is dead code** — it accepts a raw `prompt` string from the client and pipes it straight to the model. Nothing in the codebase calls it (only `CLAUDE.md` mentions it; the modal uses `/api/career-match`). An unauthenticated pipe-any-prompt-to-Claude endpoint is a cost/abuse hole independent of this project. Flagging, not fixing.

## 2. Careers

**No careers table exists** — not in Supabase (all ~140 public tables listed; none is a careers catalog) and not in the repo. Careers are generated live per user and stored as a jsonb blob:

```sql
-- supabase/migrations/create_quiz_submissions.sql
career_matches jsonb
```

(`quiz_submissions` has 47 rows in production.)

**No trait-to-career mapping exists.** There is nothing to reuse. What would need to be built, and it is less than it sounds for 8 careers:

1. A trait taxonomy for the middle-school instrument (pick ~5–6 dimensions).
2. A per-career trait weight vector — 8 careers × 6 traits is 48 hand-authored numbers, sitting as columns or jsonb on `ms_careers`. Score = dot product, rank, take top N. That fits the house rule already locked for the cards: pre-generated, human-reviewed, never live-generated for a child.

Closest existing career-ish content: `lib/internships.ts` — 12 static internship tracks with `careers: string[]` (related job titles), `salaryRange`, `dayInTheLife` bullets. It is marketing content for `/curriculum`, not a matching table, but "Registered Nurse" and adjacent titles appear there, and its `dayInTheLife` format shows the org has written in this shape before.

## 3. Email

Resend `^6.10.0` (`package.json`), env var `RESEND_API_KEY` (`.env.example:34`). There is **no single email seam** — 16 files instantiate `new Resend(...)` themselves:

- Public-site routes with inline HTML template builders: `app/api/quiz-submit/route.ts`, `send-receipt`, `apply`, `partner-waitlist`, `program-partner-signup`, `demoday/signup`, `ygb/register`, `stripe-webhook`, `save-donation`.
- BloomOS/admin: `lib/email/operator.ts` (operator digest helpers + `operatorEmailShell`), `lib/fundraising/stewardship.ts`, comms/acknowledgment routes.
- `lib/email/templates/*.ts` — 7 template modules, all for `/meet` bookings + ygb.

From address everywhere: `Ambition Angels <careers@mail.ambitionangels.org>`.

**Emails to non-authenticated users are already routine.** Three live examples: quiz results go to whatever email is typed into the modal (`app/api/quiz-submit/route.ts:174-180` — no verification, fire-and-forget), `/meet` booking confirmations/reminders go to `attendee_email`, and ygb registration confirmations. The `/ms` `deliver` route is squarely within existing precedent. Note `quiz-submit` also sends Remi a per-submission notification email (`route.ts:186-213`) — worth copying for `/ms` deck deliveries.

## 4. App codes

**Does not exist. Plainly.** The Ambition app (`com.theambitionapp.ambitionappRN`) is a separate codebase; this repo only links to its App Store / Play Store pages. There is:

- No invite/referral/signup code concept for the app anywhere in this repo.
- The only `invitations` table (`supabase/migrations/create_bloomos_core.sql:34`, 0 rows) is BloomOS admin org-membership invites — unrelated.
- Every `referral` column is a free-text "how did you hear about us" field.

A code **cannot be issued from this repo for the mobile app** — that requires the app's own backend, which this codebase does not touch. The closest architectural precedent for "no-login access by code" is `bookings.cancel_token` (`create_meet_schema.sql`: `cancel_token text unique not null default gen_random_uuid()::text`), which lets an anonymous visitor manage a booking — a good pattern to mirror for the six-character claim code, but it proves nothing about app signup codes.

## 5. Supabase

- **Project:** `Ambition-Angels` (`kzzdtibbwsucloaoqpqa`, us-east-1, Postgres 17). Table set matches the repo's migrations exactly.
- **RLS: enabled on every single public table.** ~140 tables, `rls_enabled: true` on all of them. The backlog the spec worries about ("we do not repeat the backlog we already have") has been retired — CI now *enforces* the standard (below).
- **No `ms_` collision.** No table name starts with `ms_`. Nearest neighbors are `messages`/`message_*` and `metric_*` — no conflict.
- **Migration workflow:** files in `supabase/migrations/` (149 of them), applied to production **manually via a GitHub Action**, not on merge and not via the SQL editor:

```yaml
# .github/workflows/db-migrate.yml
# "Manual, audited migration runner (BloomOS Ring 1)."
on:
  workflow_dispatch:
    inputs:
      file: ...
# → psql --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/<file>
```

  Confirmed: **migrations are not auto-applied on merge.** Guardrails a new `ms_` migration must clear:
  - `tests/migrations.test.ts` — every `create table`/`create index` must be idempotent (`if not exists`).
  - `.github/workflows/rls-test.yml` → `scripts/test-rls.sh` applies every migration to a throwaway Postgres in an **explicit ordered list inside the script** ("New migrations must be appended here as they land"), then runs `supabase/tests/rls-leak-test.sql` (owner/staff/stranger/anon access matrix) and `supabase/tests/tenant-default-ratchet.sql`.
  - The ratchet **fails the build if a new table ships an `org_id` column with a default.** The `ms_` tables should either carry no `org_id` at all (they are public-product tables, not tenant data) or carry it NOT NULL with no default.

## 6. Where the spec conflicts with reality

| Spec says | Reality |
|---|---|
| "`/assessment` flow stays exactly as it is" / "the assessment on the main site" | `/assessment` does not exist. The instrument is a modal on `/` and `/curriculum`. Nothing about `/ms` can break it, because there is no page to break. |
| Locked decision 2: "No shared components except **the trait model underneath**" | There is no trait model underneath. Four inline 1–5 self-ratings fed into a prompt string. The one thing the spec planned to share must be invented. |
| "trait scoring" in Phase 2, `trait_scores jsonb` in `ms_sessions` | No scoring function exists anywhere. Matching today is `JSON.parse` of a Claude completion. A deterministic scorer is new work — and it is the right call, since live LLM matching for under-13s would fight locked decisions 7 and 8. |
| Phase 0 question: "is there an existing careers table… trait-to-career mapping?" | No, and no. Build both. Small: 8 careers × ~6 traits, hand-authored on the row. |
| "the Ambition app code" delivered with the deck | No app-code concept exists in this repo, and this repo cannot mint one — the app is a separate codebase/backend. Today's quiz email just links to the store pages. |
| "RLS is on from day one… we do not repeat the backlog we already have" | The backlog is gone: RLS is on for all ~140 tables and CI enforces the access matrix. The house bar is now *higher* than the spec's — new tables are expected to appear in `rls-leak-test.sql` and pass the tenant ratchet. |
| "Migrations by hand in the Supabase SQL editor" | The repo convention explicitly exists **because** SQL-editor pastes leave no trail: the audited `db-migrate.yml` action is the path. Also new migration files must be appended to `scripts/test-rls.sh`. |
| "~24 items" instrument, "current instrument is written for 16 year olds and the vocabulary will not survive" | Current instrument is ~15 items, 5 of which are free-text essays. It's not a vocabulary problem, it's a format problem — a grade-5, no-free-text instrument is a from-scratch write, which conveniently also satisfies "no free text from a child ever reaches the model." |
| "Room screen… assigned by the room screen" (implies some live-ish room state) | No realtime infra in use anywhere; fine — spec already rules out synced state, so the room screen polls. The in-memory `lib/rate-limit.ts` is per-instance and resets on cold start, adequate for the two live-AI endpoints. |

One adjacent finding worth stating even though `/ms` doesn't cause it: **the current quiz collects an email with an "Under 16" age option and no COPPA gate** (`CareerQuizModal.tsx:330,542`). A 12-year-old can and probably does type their own email into the main site today. `/ms` fixing this by design is good; the existing modal is the standard the spec's COPPA section says we must never meet again.

---

## What I would change about the spec

1. **Rewrite locked decision 2's premise before Phase 1, not after.** "No shared components except the trait model underneath" implies inheritance; there is nothing to inherit. Own it: `/ms` gets a purpose-built trait model (~5–6 dimensions), a hand-authored weight vector per career stored on the `ms_careers` row, and a dot-product scorer. That's a day of design work, but it belongs in Phase 1 (content) alongside the cards — the weights are content, Remi-reviewed like everything else — not discovered mid-Phase-2.

2. **"Your top ten careers" is impossible with an eight-career catalog.** The results screen, `top_ten jsonb`, and the solo flow all say ten; the launch set is eight. Either rank all eight (my recommendation — at 8 careers, hiding the bottom ranks costs more than it hides), or say "your top 4" and keep the rest as "also in the deck." Pick one and update the schema field name; `top_ten` will read as a bug forever.

3. **Demote the app code from deliverable to open question — it currently blocks Phase 4 on a codebase we don't control.** The `deliver` email can ship v1 exactly like today's quiz email does: store links. If a real redeemable code materializes from the app team, it's an additive column on `ms_deliveries`. Do not let a cross-repo dependency sit inside "the it-can't-get-lost phase."

4. **Replace the migration line.** "By hand in the Supabase SQL editor" contradicts the repo's own audited workflow. New text: one idempotent file per phase in `supabase/migrations/`, appended to the `ordered=()` list in `scripts/test-rls.sh`, `ms_` policies asserted in `rls-leak-test.sql` (anon must read approved careers but never `title`/`clue_8`; a stranger's session must not read another claim code's rows), no `org_id` default, applied to prod via the `db-migrate.yml` action.

5. **Make the title/clue_8 withholding structural, not behavioral.** The spec says they're "never sent to the client until the student taps" — with anon-readable rows, an RLS policy can't do column-level hiding. Concrete shape: anon reads a view of `ms_careers` that excludes `title` and `clue_8`; the reveal goes through a route handler (or RPC) that also writes the `ms_explored.clues_used` row. That makes the calibration telemetry a side effect of the only path to the answer — you can't get the title without telling us which clue you were on. Cheap, and it makes the spec's most interesting metric un-skippable.

6. **Delete or repoint the `/api/career-quiz` route while we're in here** (separate PR, not `/ms`): it's uncalled, unauthenticated, and forwards arbitrary client prompts to the model on our API key. Phase 0 rules say report, not fix — reported.

7. **Reading-level open item → closed.** The answer to "will the current instrument survive a sixth grader" is no, and not because of vocabulary: five essay boxes. The 24-item, one-per-screen, tap-only instrument in the spec is the correct and necessary design; budget it as a full write, with the same review bar as the cards.
