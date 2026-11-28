# Spec: AI output checks on the website

Fix spec for the website surfaces listed in Part C1 of `specs/ai-surface-inventory.md`. The staff-facing items from Part C2 moved to `remi-sobo/bloomos` in the repo split. They have their own spec there (`specs/ai-output-review.md`).

Decisions taken before this spec (Remi, 2026-11-28):
- The career quiz email carries a link back to the results, and no AI text.
- The room host email keeps its AI prompts, with checks added.
- Teen-facing screens get one shared automated check. Human review is not possible for text a teen sees the moment it is generated.

## Problem statement

Four places on the website show or send text a model wrote, and nobody reads that text first.

- A teen finishing the career quiz sees ten AI-written careers on screen.
- The quiz then emails those same careers to whatever address was typed.
- A student finishing "What Are You Built For" sees a three-sentence AI summary.
- A room host gets an email with one AI-written conversation prompt per student.

Today the only shared check is a sweep that swaps em dashes for commas. On top of that:
- Two of the emails drop model text into HTML without escaping it.
- The career list has no shape check at all.
- `/api/quiz-submit` takes the career list from the request body. Anyone can POST their own HTML and have it emailed, from the Ambition Angels domain, to any address they choose.

The fix is not to put a person in front of every output: a teen waiting on results cannot wait for review. Each output passes one written check before it reaches anyone, falls back to safe text when it fails, and never reaches an inbox as raw HTML.

**State of the code:** checked against `main` at `d4797c1` (2026-11-28), after the repo split. `/shannon` was deleted in [remi-sobo/ambition-angels#632](https://github.com/remi-sobo/ambition-angels/pull/632), so it drops out of scope.

## Who is affected

- A teen, or an adult answering for one, taking the career quiz at `/teens/career-quiz` or in the quiz modal on `/` and `/curriculum`.
- A middle schooler finishing `/teens/built-for/assess`.
- A teacher or program lead running a "Built For" room, who gets the deck email.
- Anyone whose address gets typed into the quiz email field, including someone abusing the open endpoint.

## Current behavior

| # | Surface | What happens today | Evidence |
|---|---|---|---|
| W1 | Career match on screen | The model returns JSON. The code runs `JSON.parse` on it with no shape or length check and sends it to the browser. React escapes it on screen. A failed request falls back to a fixed list in the client. | `app/api/career-match/route.ts` :91-94; `components/CareerQuiz.tsx` :55, :129, :138 |
| W2 | Quiz email | The client posts `careers` back to `/api/quiz-submit`. The route does not validate the list. It forwards it to BloomOS, then emails it with `title`, `description`, `salary` and `why` placed into the HTML unescaped. There is no rate limit. | `app/api/quiz-submit/route.ts` :7-35, :132-162 |
| W3 | Built For summary | The model writes three sentences. The code drops output that is empty, longer than 600 characters, or matches 5 negative phrases, then stores it in `ms_sessions.summary_text`. Nothing checks sentence count, emoji or exclamation marks, though the prompt forbids them. | `lib/ms/summary.ts` :55-75; `app/api/ms/session/route.ts` :74, :120 |
| W4 | Room host email | One model call writes a line per student as `HANDLE :: prompt`. Each prompt goes into the email HTML unescaped. There is no length or phrase check and no rate limit. `host_email` was typed by the host and never verified. | `app/api/ms/room/[code]/deliver/route.ts` :46-71, :93, :147-227; `app/api/ms/room/route.ts` :17-27 |

## Desired behavior

- **W1.**
  - The career list passes the shared check before it leaves the server: exactly 10 items, each field a short plain string, nothing on the blocked list.
  - If the check fails, the route returns an error and the client shows the fixed fallback it already has.
  - The route stores the checked list and returns a result token alongside it.
- **W2.**
  - `/api/quiz-submit` takes the result token, not a career list. It loads the stored list server-side and forwards that to BloomOS.
  - The email names no careers. It says the results are ready and links to `/teens/career-quiz/results/[token]`, a page that renders the stored list.
  - The route is rate-limited, and sends at most one email per token.
- **W3.** The summary passes the shared check, which adds three rules to today's filter:
  - exactly three sentences
  - no emoji
  - no exclamation marks

  On failure the page renders without a summary, as it does today.
- **W4.**
  - Each prompt passes the shared check: one sentence, at most 200 characters, nothing on the blocked list.
  - A prompt that fails is left out for that student. The rest of the email still goes.
  - Every value placed into the email is HTML-escaped.
  - The deliver route is rate-limited per room and per IP.
- **All four.** A failed check is logged with the surface name and the rule that failed. The text is not logged, so teen data stays out of logs.

## Scope

**In:**
- **A shared check module, `lib/ai/check.ts`.** It holds:
  - `checkPlainText(text, rules)` for prose (length, sentence count, emoji, `!`, blocked phrases)
  - `checkCareerList(value)` for the W1 shape
  - a single blocked-phrase list, `lib/ai/blocked.ts`

  `lib/ms/summary.ts` and the deliver route both use it.
- **An `escapeHtml` helper** (`lib/site/escapeHtml.ts`), used by every email builder that takes model output or user input: quiz and room deliver.
- **A `quiz_results` table** in the website database: id (random token), careers (jsonb), created_at, emailed_at. It holds no answers, no name and no email. The migration is idempotent (`if not exists`) as `tests/migrations.test.ts` requires, and follows the ledger rules in CI.
- **The results page** `/teens/career-quiz/results/[token]`, set to noindex and reading through `websiteDb()`.
- **Route changes:** `career-match` stores the list and returns the token. `quiz-submit` takes the token, is rate-limited, and sends one email per token. Room deliver adds escaping, checks and a rate limit.
- **The client change** in `components/CareerQuiz.tsx` to send the token instead of the list.
- **Tests** for the check module, the escaping, the token flow, and that `quiz-submit` ignores a client-sent `careers` field.

**Out:**
- Anything in BloomOS. That spec lives in `remi-sobo/bloomos`.
- Replacing live generation with pre-approved text. That was considered and set aside.
- Verifying `host_email` before the room email goes out. This is worth doing, but it changes the room flow, so it gets its own spec.
- Swapping the in-memory rate limiter for a shared store. `lib/rate-limit.ts` already names that as a later step.
- Changing the prompts. Prompt text stays as it is, so behavior changes only through the checks.
- Career card drafting (`ms_cards`). It already sits behind human approval.
- A retention or cleanup job for `quiz_results`, which is listed as an open decision below.

## Architecture sketch

```
Career quiz (W1, W2)

  CareerQuiz.tsx --answers--> POST /api/career-match
                                 | generateText (gateway, fast tier)
                                 | checkCareerList  --fail--> 502 --> client shows getFallback()
                                 | insert quiz_results {id: token, careers}
                                 v
                     <-- { careers, resultToken }
  CareerQuiz.tsx --{answers, audienceMode, resultToken}--> POST /api/quiz-submit
                                 | rateLimit(ip)
                                 | load quiz_results by token (404 if missing)
                                 | sendToBloomOS("quiz_submission", {answers, audienceMode, careers: stored})
                                 | if email and emailed_at is null:
                                 |    Resend: "Your results are ready" + link /teens/career-quiz/results/{token}
                                 |    set emailed_at
                                 v
  /teens/career-quiz/results/[token]  (server page, noindex) reads quiz_results via websiteDb()

Built For summary (W3)

  POST /api/ms/session --> generateSummary --> checkPlainText(text, SUMMARY_RULES) --fail--> null
                                                                      --pass--> ms_sessions.summary_text

Room deliver (W4)

  POST /api/ms/room/[code]/deliver
     | rateLimit(room, ip)
     | generatePrompts --> per line: checkPlainText(prompt, PROMPT_RULES) --fail--> omit that prompt
     | buildRoomEmailHTML: escapeHtml(handle, card titles, prompt)
     v
  Resend --> host_email

Shared

  lib/ai/blocked.ts   one list of blocked phrases (today's 5 from summary.ts, plus deficit, comparison and hype phrases)
  lib/ai/check.ts     checkPlainText, checkCareerList; returns {ok: true, value} | {ok: false, rule}
  lib/site/escapeHtml.ts
```

There is still no zod in this repo. `checkCareerList` is a hand-written guard to match the existing code. Adding zod would be a separate decision.

The quiz still sends the answers and the stored career list to BloomOS through `sendToBloomOS`, unchanged. The split rule holds: this site keeps no BloomOS key.

## Staged build order

- **Phase 1: Shared check and escaping.** Add `lib/ai/check.ts`, `lib/ai/blocked.ts`, `lib/site/escapeHtml.ts` and their unit tests. Move the summary's filter onto the shared check (W3). **Commit point:** CI is green, and the summary tests still pass with the three new rules.
- **Phase 2: Room host email (W4).** Escape every value in `buildRoomEmailHTML`, run each prompt through the check, and add the rate limit. **Commit point:** a test renders the email with a prompt containing `<script>` and gets escaped text, and a failing prompt is left out while the email still sends.
- **Phase 3: Career match checked and stored (W1).** Add the `quiz_results` migration and run `checkCareerList` in `career-match`, which then stores the list and returns `resultToken`. The client keeps working, since it ignores the new field. **Commit point:** a malformed model reply gives a 502 and the fallback list. The migration is applied and the ledger check passes.
- **Phase 4: Quiz email by link (W2).** Make `quiz-submit` token-only, rate-limited and once-per-token, with an email that carries no careers. Add the results page and switch the client to send the token. **Commit point:** a POST with a hand-made `careers` field and no valid token sends nothing and forwards nothing. The email HTML contains the link and no career text.

Each phase is one PR.

## Definition of done

- `grep` finds no model output placed into email HTML without `escapeHtml` in `app/api/quiz-submit` or `app/api/ms/room/[code]/deliver`.
- `POST /api/quiz-submit` with `{answers, audienceMode, careers: [<html>]}` and no valid `resultToken` returns 4xx, sends no email and makes no BloomOS call (test).
- The quiz email HTML contains `/teens/career-quiz/results/` and none of the stored career titles (test).
- A second `quiz-submit` for the same token sends no second email (test).
- A model reply with 9 careers, a missing field, or a field over its length limit makes `career-match` return an error, and the quiz screen shows the fallback list (test plus a manual run).
- A summary with an exclamation mark, an emoji, or four sentences is dropped, and the results page renders without it (test).
- A room prompt containing a blocked phrase is left out of the email, and the other students' prompts still appear (test).
- Each failed check writes one log line naming the surface and the rule, with no model text in it.
- `/teens/career-quiz/results/[token]` renders the stored list. It returns 404 for an unknown token and sends `noindex`.
- CI is green: typecheck, lint, `npm test`, the migrations test and the split-boundary test.

## Failure modes to watch for

- **The check is too strict.** If the model regularly returns 11 careers or a long salary string, every quiz falls to the same fallback list and teens get generic results. The fix is to watch the log rate for `checkCareerList` failures in the first week. If it runs above a few percent, adjust the limits rather than the prompt.
- **The blocked list catches normal words.** A phrase like "not" or "struggle" inside a career description ("helping families who struggle with housing") would drop good output. The list matches whole phrases aimed at the reader ("you're not", "you struggle"), and the tests include harmless sentences that must pass.
- **The results link stops working.** The link in the email has to keep working. If `quiz_results` rows are ever cleaned up, or the route moves, old emails break. Rows stay until the retention decision below is made, and the route never moves.
- **Tokens leak results.** Anyone holding a link sees that teen's ten careers. The token is a long random id, and the table holds no name, email or answers, so a leaked link shows careers only.
- **Rate limits reset on cold start.** The in-memory limiter resets when a new instance starts, so a determined sender can still trigger emails. Each email now carries only a fixed message and a link, which takes away the reason to abuse it. A shared-store limiter stays a separate decision.
- **The deliver email arrives with no prompts.** If the model output has no lines in the `HANDLE :: prompt` form, every prompt fails the check. That matches today's behavior when generation fails, but it would now be logged.

## Open decisions

- How long `quiz_results` rows are kept. There is no cleanup job in this spec. Choose a retention period before Phase 4 ships, or decide to keep rows indefinitely.
- Whether the email should still name the teen in the subject line ("Maya's career matches are ready"). The name comes from the form and is not AI text. Today it is kept.
