# AI surface inventory

Read-only diagnostic of every place BloomOS (and the public site it ships with) calls an AI model or takes an automated action. It reports what exists as of commit `ce59c5d` (2026-10-13). It proposes no fixes. Anything the code could not settle is marked **UNDETERMINED**.

Paths are relative to the repo root. Line numbers are approximate where a file was read in pieces.

## Contents

- [0. Shared plumbing](#0-shared-plumbing)
- [Part A. AI model calls](#part-a-ai-model-calls)
- [Part B. Automated actions with no model in the route](#part-b-automated-actions-with-no-model-in-the-route)
- [Part C. Generated text that reaches someone without passing a check](#part-c-generated-text-that-reaches-someone-without-passing-a-check)
- [Part D. Could not determine](#part-d-could-not-determine)

---

## 0. Shared plumbing

- **Provider.** Every model call in the repo goes to Anthropic. A grep of `app/`, `lib/`, `components/` and `scripts/` for openai, gpt-, gemini, embedding and voyage found nothing.
- **`lib/ai/gateway.ts`** is the intended single place where models are called.
  - It holds `generateText` (around :93) and `generateStructured` (around :168, a single forced tool call).
  - Tiers are set in `MODEL_BY_TIER` (:33-36): `fast` = `claude-sonnet-4-6`, `deep` = `claude-opus-4-8`.
  - The system prompt is cached as ephemeral.
  - `generateStructured` returns the raw tool input without validating it, so each caller parses it itself.
- **Several call sites bypass the gateway.** They use either a direct `fetch` to `api.anthropic.com` or the SDK directly:
  - `app/api/shannon`
  - `app/api/admin/report/debug`
  - `lib/briefing.ts`
  - `lib/admin/briefing/narrate.ts`
  - `lib/finance/ai-categorize.ts`
  - `lib/meetings/reed.ts`
  - `lib/agents/reed/client.ts`
  - `lib/agents/prospect-discovery`
  - `lib/agents/funder-research`
- **Voice sweep (`lib/ai/voice.ts`).**
  - `cleanVoiceText` and `cleanVoiceDeep` replace each em dash with ", " and collapse double commas. That is all they do.
  - They do not check words, facts, numbers, names, tone or length.
  - In this document, "voice sweep" refers only to this em-dash replacement.
- **Spend ledger (`lib/ai/ledger.ts`, table `ai_calls`).**
  - `ai_calls` is append-only: RLS has insert and select policies only.
  - Each caller has to call `logAICall` itself. The gateway does not do it.
- **Org cap (`lib/ai/cap.ts`, `orgOverAICap`).**
  - It is a monthly backstop for each org: $100 by default, or `ORG_MONTHLY_AI_CAP_USD`.
  - It fails open: if the read fails, spend is treated as $0.
  - Reed has its own $25 cap (`lib/agents/reed/cost.ts`).
  - The fundraising agents share a $20 wallet, which is computed from `fr_agent_activity_log`.
- **Callers that neither log to `ai_calls` nor check the org cap:**
  - acknowledgments/draft
  - report/debug
  - briefing narrative (`narrate.ts`)
  - weekly briefing (`lib/briefing.ts`)
  - finance categorize
  - meeting transcript parse (`lib/meetings/reed.ts`)
  - career-match
  - shannon
  - ms summary
  - ms room deliver
  - ms card generate
- **Pricing (`lib/ai/cost.ts`).**
  - Unknown models are billed at Sonnet rates.
  - Web-search fees are not priced anywhere.
  - Next-best-action and prospect discovery compute cost with their own hard-coded rates, which match the shared table.

---

## Part A. AI model calls

Each entry gives the six requested fields in this order:

1. location
2. trigger
3. output
4. writes and undo
5. human review
6. model and prompt

A **Checks** line is added where code inspects the output.

### Public site and teen surfaces

#### A1. Career quiz match
1. **Location:** `POST /api/career-match` (`app/api/career-match/route.ts`, POST around :67-99). The client then forwards the result to `POST /api/quiz-submit` (`app/api/quiz-submit/route.ts`).
2. **Trigger:** a public user finishes `components/CareerQuiz.tsx`. The quiz runs on `/teens/career-quiz` and in `CareerQuizModal` on `/` and `/curriculum`.
   - No auth is required.
   - A per-IP rate limit allows 10 requests per 10 minutes.
3. **Output:**
   - A JSON list of 10 careers (title, description, salary, why), shown to the user on screen.
   - quiz-submit then emails that same AI text to the address the user typed, via Resend. `buildEmailHTML` (:13-35) puts the fields into the HTML without escaping.
   - quiz-submit also emails remi@ the top 3 titles.
4. **Writes:** quiz-submit inserts a `quiz_submissions` row that includes `career_matches`.
   - No update or delete path was found.
   - Sent email cannot be recalled.
5. **Human review:** none.
6. **Model and prompt:** `generateText` at the fast tier, so `claude-sonnet-4-6`.
   - The prompt is `buildPrompt` (:26-65), with no system prompt.
   - It includes the teen's free-text answers.

**Checks:**
- The voice sweep runs, then `JSON.parse`.
- There is no schema validation, no length check, no word check and no salary check.
- quiz-submit does not validate `careers`.

#### A2. "Gigi" decision tool
1. **Location:** `POST /api/shannon` (`app/api/shannon/route.ts`). The handler is around :374-404 and `callClaude` around :219-255.
2. **Trigger:** someone submits the 20-question form on `/shannon`.
   - The page is not in the middleware `gated` list.
   - The API has no auth and no rate limit.
3. **Output:** an email via Resend to remi@ambitionangels.org and shannon@ambitionangels.org (:7-8). The email carries the AI analysis. The browser gets only `{success:true}`.
4. **Writes:** no database write. The email cannot be recalled.
5. **Human review:** none. Both recipients get the AI analysis in the same send, including the person the analysis is about.
6. **Model and prompt:** `claude-sonnet-4-6`, via a raw `fetch` with an assistant prefill of `{`.
   - System prompt: `SYSTEM_PROMPT` (:40-150).
   - User message: `buildClaudeUserMessage` (:171-183).

**Checks:**
- An em-dash sweep runs on each field (`scrubAnalysis`).
- The output is HTML-escaped.
- It is parsed with `JSON.parse` and a cast. Nothing checks the number of options or the score range.

#### A3. Career card drafting
1. **Location:** `POST /api/admin/careers/generate` (`app/api/admin/careers/generate/route.ts`), which calls `generateCard` in `lib/ms/generate.ts` (:134-181).
2. **Trigger:** an admin clicks "Generate draft", "Regenerate" or "Generate all queued" in `app/admin/careers/_components/CareersControls.tsx`.
3. **Output:** a database write.
4. **Writes:** an upsert into `ms_cards` on conflict `soc_code`.
   - It sets `status='draft'` and clears `reviewed_by` and `reviewed_at`.
   - The model writes `field`, `day_vignette`, `clue_1` to `clue_5` and `clue_8`. Clues 6 and 7 are rendered from O*NET and BLS data.
   - **Undo:** `app/api/admin/careers/review/route.ts` provides unapprove (back to draft), retire, and hard delete of a card that is not approved.
   - Regenerating overwrites the earlier draft, including human edits. There is no history table.
   - Regenerating an approved card is refused with a 409.
5. **Human review:** yes.
   - Public reads filter on `status='approved'`: the `ms_catalog` view, the reveal route, the card page, the daily game and The Cut.
   - Approval is an admin click, enforced by the constraint `ms_cards_approved_requires_review`.
   - Approval does **not** require the machine gates to pass. It checks only that the vignette and the 8 clues are non-empty (`review/route.ts` around :40-50). The UI shows gate failures but leaves Approve enabled.
6. **Model and prompt:** `generateStructured` at the deep tier, so `claude-opus-4-8`. The model that actually ran is stored in `generated_by`.
   - System prompt: `buildSystemPrompt` (`lib/ms/generate.ts` :80-107), with few-shot examples from `lib/ms/fewshot.ts`.
   - User prompt: `buildUserPrompt` (:109-127).
   - Tool: `CARD_TOOL` (:45-78).

**Checks:** `runGates` (`lib/ms/gates.ts` :90-164) checks:
- that no field is empty
- that the title or a variant of it is absent from the vignette, clue 1 and clue 8
- clue 1 against an industry-giveaway list
- that clue 8 is at least 60 characters
- that clue 7 contains the median pay
- that the vignette reads below grade 6.0

No voice sweep runs here.

**Comment vs. code:** the route header comment says a draft that fails the gates "is regenerated once". The code makes one call per click and stores the failing draft.

#### A4. "Built For" results summary
1. **Location:** `POST /api/ms/session` (`app/api/ms/session/route.ts`), which calls `generateSummary` in `lib/ms/summary.ts` (:55-75).
2. **Trigger:** a public student finishes the 30-tap wizard at `/teens/built-for/assess`.
   - No auth is required.
   - A per-IP rate limit allows 20 requests per 10 minutes.
3. **Output:** a database write that is then shown to the student on `/teens/built-for/results/[session]`.
4. **Writes:** inserts `ms_sessions.summary_text`. No update or delete path was found.
5. **Human review:** none for any individual output. `scripts/preview-ms-summaries.ts` (A16) lets a human sample output offline.
6. **Model and prompt:** `generateText` at the fast tier, so `claude-sonnet-4-6`.
   - System prompt: `SUMMARY_SYSTEM_PROMPT` (:19-27).
   - User prompt: `buildSummaryPrompt` (:38-52). It includes trait names and O*NET titles, and no free text from the student.

**Checks:**
- The voice sweep runs.
- The summary is dropped if it is empty or longer than 600 characters.
- It is also dropped if it matches `/you're not|you are not|weakness|struggle|should work on/i`.
- When it is dropped, the page renders without a summary.

#### A5. Facilitator prompts in the room deck email
1. **Location:** `POST /api/ms/room/[code]/deliver` (`app/api/ms/room/[code]/deliver/route.ts`). The handler is around :147-227 and `generatePrompts` around :46-71.
2. **Trigger:** the room host clicks "Send every deck to my inbox" on the projected room screen.
   - The request needs a `host_token`.
   - The route has no rate limit.
   - `host_email` was typed by the host when they opened the room and was never verified.
3. **Output:** a Resend email to `host_email` with one AI-written conversation prompt per student handle. Each prompt is placed in the HTML without escaping (:93).
4. **Writes:** `ms_deliveries` rows are appended. The AI text itself is not stored. The email cannot be recalled.
5. **Human review:** none.
6. **Model and prompt:** `generateText` at the fast tier, so `claude-sonnet-4-6`.
   - System prompt: inline at :50-55.
   - Input is built by `promptsInput` (:27-36).

**Checks:**
- The voice sweep runs.
- Lines are parsed as `HANDLE :: prompt`.
- There is no length check and no phrase filter. Compare A4, which has both.

### BloomOS admin

#### A6. Donor acknowledgment draft
1. **Location:** `POST /api/admin/acknowledgments/draft`.
2. **Trigger:** the "draft" button in `app/admin/fundraising/acknowledgments/_components/AckComposer.tsx`.
3. **Output:** text placed into an editable textarea.
4. **Writes:**
   - The draft route writes nothing.
   - The separate send route, `POST /api/admin/acknowledgments/send`, emails the donor whatever note the operator submits. It then updates `gifts` and `acknowledgments` and writes an audit row.
   - If Resend rejects the email, the gift claim is reverted. A sent email cannot be undone.
5. **Human review:** yes. The draft is editable, and an operator has to click send. The send route has no record of whether the note came from AI.
6. **Model and prompt:** `generateText` at the fast tier, so `claude-sonnet-4-6`. The prompt is inline (around :86-97), with identity from `getAgentOrgProfile`.

**Checks:** the voice sweep runs, and an empty result returns a 502.

#### A7. Capture: voice note or pasted text to proposed cards
1. **Location:** `POST /api/admin/capture`, with code in `lib/capture/*`.
2. **Trigger:** a user records or pastes a note: the mobile "+", Quick Add, entity pages or paste.
   - Requires the `ai.capture` entitlement.
   - Limited to 30 per user per hour.
   - Subject to the org cap.
3. **Output:** database writes plus a stack of cards in the UI.
4. **Writes:**
   - **During parse:**
     - `captures`
     - `capture_cards` (proposed or held); a re-parse deletes undecided cards
     - `ai_calls`
   - **When a human confirms** (`lib/capture/confirm.ts`), cards are filed into:
     - `interactions`
     - `partner_interactions`, which also moves `partners.last_touch_at`
     - `ops_tasks`
     - `reed_drafts` with status `drafted`
   - **Undo:**
     - `discardCard` works before filing.
     - `undoCard` works within 10 minutes. It deletes the filed row only if the row is unchanged.
     - The move of `partners.last_touch_at` is not rolled back.
     - After 10 minutes Capture has no undo path.
   - A pg_cron job, `capture-transcript-purge`, nulls transcripts after 90 days (see B11).
5. **Human review:** yes. Every card needs a human to confirm it. Held cards first need the human to pick a match.
6. **Model and prompt:** `generateStructured` at the fast tier, so `claude-sonnet-4-6`.
   - `SYSTEM`: `lib/capture/prompt.ts` :90-108.
   - `CAPTURE_TOOL`: :20-88.
   - `buildCapturePrompt`: :137-174.

**Checks** (`lib/capture/validate.ts`):
- references are checked against server-built candidate lists
- dates must fall between -30 and +365 days
- enum values are coerced
- at most 15 cards
- `cleanProse` applies the voice sweep, changes `!` to `.`, and truncates to 2000 characters

#### A8. Grant Coach, single run
1. **Location:** `POST /api/admin/grants/coach`.
2. **Trigger:** the GrantCoach panel on `/admin/fundraising/grants/[id]`.
3. **Output:** advisory text shown in the panel. The input is pasted text or an attached PDF (`lib/fundraising/grantCoachDocs.ts`).
4. **Writes:** `ai_calls` only.
5. **Human review:** not applicable. No record changes.
6. **Model and prompt:** `generateText` at the deep tier, so `claude-opus-4-8`, with `voice:false`.
   - `COACH_SYSTEM`: `lib/fundraising/grantCoach.ts` :140.
   - `COACH_PROMPTS`: :170 onward.
   - `buildCoachUserPrompt`: :543.

**Checks:** none on the output.

#### A9. Grant Coach, "defend the draft"
1. **Location:** `POST /api/admin/grants/coach/defend`.
2. **Trigger:** a chat turn in `GrantCoach.tsx`.
3. **Output:** advisory text.
4. **Writes:** `ai_calls` only.
5. **Human review:** not applicable.
6. **Model and prompt:** `claude-opus-4-8`, `voice:false`. The prompt is `DEFEND_DRAFT` (`grantCoach.ts` around :508).

**Checks:** history is limited to 30 turns of 4000 characters each.

#### A10. Report a bug: AI interview
1. **Location:** `POST /api/admin/report/debug`. The result is filed through `POST /api/admin/report`, which itself makes no model call.
2. **Trigger:** the "Report" flow (`app/admin/_components/ReportModal.tsx`), reached from QuickAdd and the mobile bar.
3. **Output:**
   - A follow-up question in the UI, then a `{title, prompt}` object.
   - When filed, it creates an `ops_tasks` row labelled `claude-prompt`, and it can create an `ops_projects` row.
   - It also sends an operator email via Resend, with the AI prompt HTML-escaped.
4. **Writes:** `ops_tasks` and optionally `ops_projects`.
   - The task can be deleted with `DELETE /api/admin/ops/tasks/[id]`.
   - The email cannot be undone.
5. **Human review:** depends on who reports.
   - **The org owner** sees the prompt and clicks to file it.
   - **Anyone else** never sees it: on "ready" it is filed automatically (`ReportModal.tsx` :114-119).
6. **Model and prompt:** `claude-sonnet-4-6`, hard-coded, via raw `fetch`. The system prompt is `buildSystem` (:30-102).

**Checks:** JSON is extracted and `action` must be `ask` or `ready`. There is no voice sweep.

#### A11. Strategy angle draft
1. **Location:** `POST /api/admin/strategy/angles/draft`.
2. **Trigger:** `ReedAngleWizard`, run on a brief the user writes.
3. **Output:** JSON returned to the wizard for editing.
4. **Writes:** `ai_calls` only.
   - The angle is saved only when the operator submits `POST /api/admin/strategy/angles`.
   - After that it can be edited or deleted through `PATCH` and `DELETE` on `/angles/[id]`.
5. **Human review:** yes. The operator edits and then submits.
6. **Model and prompt:** `generateText` at the fast tier, so `claude-sonnet-4-6`, `voice:false`. The prompt is `SHARED_INSTRUCTIONS` plus `buildSystem` (:21-60).

**Checks:** fields are limited in length, and badge and tone must be on allow-lists. The org cap is not checked.

#### A12. Morning briefing narrative (Briefing v2)
1. **Location:** `lib/admin/briefing/narrate.ts`: `generateNarrativeNow` (:309), `getNarrative` (:359) and `prewarmNarrative` (:385).
2. **Trigger:** any of three.
   - The **first load of the day** of `/admin/briefing`, when no row exists yet. This is a page view, not a click.
   - The "Regenerate" button (`POST /api/admin/briefing/narrative`).
   - The `daily-reminders` cron (B3). Nothing in the repo currently schedules that cron.
3. **Output:** text shown to every admin on the briefing page.
4. **Writes:** an upsert into `bloomos_briefing_narrative` on `(org_id, brief_date)`. This **overwrites** the day's row, with no history and no undo.
5. **Human review:** none.
6. **Model and prompt:** `claude-sonnet-4-6` (:66), called directly through the SDK with the forced tool `submit_briefing`.
   - `RESIDENT_SYSTEM_PROMPT`: :122-135.
   - `buildBriefingSystemPrompt`: :137-153.
   - Facts: `renderFactsForModel` (:171-212).

**Checks:**
- Length caps of 120, 900 and 180 characters.
- The voice sweep runs.
- If generation fails, deterministic fallback text is used.
- Nothing checks that the numbers in the prose match the input facts. That rule exists only in the prompt.

#### A13. Weekly / on-demand briefing
1. **Location:** `lib/briefing.ts`: `generateBriefing` (:208-230) and `narrate` (:150-206).
2. **Trigger:** either of two.
   - On demand: `POST /api/admin/briefing`, from the button in `BriefingControls.tsx`.
   - The `weekly-digest` cron (B10). Nothing in the repo currently schedules it.
3. **Output:**
   - A database write, shown on `/admin/briefing/weekly`.
   - On the cron path, an email to every operator. The narrative and priorities go into that email's HTML **unescaped** (`app/api/cron/weekly-digest/route.ts` :150-160).
4. **Writes:** inserts into `briefings`, one new row per run. No undo path was found.
5. **Human review:** none.
6. **Model and prompt:** `claude-sonnet-4-6` (:148), via raw `fetch`. The prompt is inline (:156-169).

**Checks:** code fences are stripped, the JSON is parsed and lengths are truncated. There is no voice sweep.

#### A14. Finance AI categorization
1. **Location:** `suggestCategories` (`lib/finance/ai-categorize.ts` :70), called from `POST /api/admin/finance/categorize/suggest`.
2. **Trigger:** the "Suggest categories (AI)" button in `AiCategorize.tsx`.
3. **Output:** UI only. The suggest route is read-only.
4. **Writes:** happen only on a human click of `POST /api/admin/finance/categorize/apply`.
   - It sets `fin_transactions.category_id` where that is still null.
   - Optionally it inserts `fin_category_rules`. Those rules then categorize future imports with no AI involved.
   - It writes an audit row that holds counts only.
   - **Undo:**
     - A category can be cleared by hand, one transaction at a time.
     - Rules can be edited or disabled. No rule DELETE route was found.
     - There is no batch undo, and the audit row does not record which rows changed.
5. **Human review:** yes, but suggestions arrive **pre-checked**.
   - Confidence of 0.5 or more pre-checks the row.
   - Confidence of 0.8 or more, with a pattern of 3 or more characters, also pre-checks "create rule".
   - One click applies everything that is checked.
6. **Model and prompt:** `claude-opus-4-8` (:16), called directly through the SDK with adaptive thinking.
   - `SYSTEM`: :40-48.
   - Tool schema: :50-68.

**Checks:** `category_id` must be one of the org's known ids, confidence is clamped, and the pattern is limited to 60 characters.

#### A15. Meeting transcript parse
1. **Location:** `POST /api/admin/meetings/[id]/transcript`, which calls `parseTranscript` (`lib/meetings/reed.ts` :26).
2. **Trigger:** a user pastes a transcript on `/admin/meetings/[id]`.
   - Only login is required.
   - There is no entitlement check, no cap, no rate limit and no ledger entry.
3. **Output:** database writes plus UI.
4. **Writes:**
   - `meeting_records.summary` is **overwritten** with the AI summary. There is no history and no edit route for it.
   - `transcript` is set to null when `store_transcript` is false, which also wipes a transcript stored earlier.
   - Pending `meeting_suggested_tasks` are hard-deleted, and 0 to 3 new pending rows are inserted.
   - Suggestions can be dismissed (there is no status guard). Accepting one inserts into `ops_tasks`, which can be deleted.
5. **Human review:**
   - **None for the summary.**
   - Yes for tasks, which need an accept.
6. **Model and prompt:** `claude-sonnet-4-6` (:18), via raw `fetch`, with no system prompt. The prompt is `buildTranscriptPrompt` (`lib/meetings/transcript-prompt.ts` :21).

**Checks:**
- The JSON is parsed.
- At most 3 suggestions, each title limited to 200 characters.
- The category is coerced.
- There is no voice sweep and no envelope marking the transcript as untrusted.

#### A16. Developer scripts
- **`scripts/capture-eval.ts`**
  - Run manually with `npm run capture:eval`.
  - Same model, prompt and validator as A7.
  - Prints to the console only and never writes.
- **`scripts/preview-ms-summaries.ts`**
  - Run manually.
  - Uses the same model and prompt as A4, on 10 synthetic profiles.
  - Prints to the console only.

### Agents (`lib/agents/*`)

#### A17. Reed Ask
1. **Location:** `POST /api/reed/ask` (`app/api/reed/ask/route.ts`), which calls `runReedAsk` (`lib/agents/reed/client.ts` :62). It is a tool loop of at most 6 turns.
2. **Trigger:** a user sends a message in `ReedPanel`: the floating button, record openers or meeting prep.
   - Requires the `ai.reed` entitlement.
   - Reed's $25 cap applies.
   - The org cap applies.
3. **Output:** the answer text shown to the user, plus the tool writes in A17a to A17d.
4. **Writes:**
   - `reed_threads`
   - `reed_messages` (both the user turn and the assistant turn)
   - `reed_activity_log`
   - `ai_calls`

   All of these are append-only, and no delete path was found.
5. **Human review:** none for the answer.
6. **Model and prompt:** `claude-sonnet-4-6` (`lib/agents/reed/cost.ts` :15). The system prompt is `buildSystemPrompt` (`app/api/reed/ask/route.ts` around :218-266). The tools are in `lib/agents/reed/tools.ts`.

**Checks:**
- The voice sweep runs on the final answer only.
- The input message is limited to 4000 characters.
- `read_document` wraps document text in an `<untrusted_document>` envelope.

**Comment vs. code:**
- The comments (`client.ts` :7, `tools.ts` :18, `route.ts` :116) say the tool set is read-only.
- The system prompt says "You cannot write anything directly".
- In fact 4 tools insert rows: `tools.ts` :726, :814, :864 and :1032. All four are staging tables, described below.

Of Reed's 19 tools, 15 only read. One of those, `read_document`, fetches file bytes with the service-role client after an RLS check. The 4 tools that write:

- **A17a. `propose_document_extraction`** (`tools.ts` :673-748)
  - **Writes:** a `reed_suggestions` row with status `suggested`.
  - **Human review:** yes. Accept in `/admin/reed` (`app/api/reed/suggestions/[id]/route.ts`) requires domain write permission, then:
    - **overwrites** `documents.expires_at` / `doc_type`, with no history; or
    - inserts `ops_tasks`.
  - **Undo:**
    - Dismiss is available before acceptance.
    - Once accepted, the suggestion cannot be reversed.
    - The document fields can be re-edited by hand.
  - **Checks:** `parseExtractionPayload` (`lib/agents/reed/extraction.ts`) runs at write time and again at accept time.
- **A17b. `save_draft`** (`tools.ts` :788-832)
  - **Writes:** a `reed_drafts` row with status `drafted`. The body is stored as written: no voice sweep and no length limit.
  - **Approve or discard:** `app/api/reed/drafts/[id]/route.ts` :39-40 sets the status without checking what the current status is.
  - **Human review:** approval sends nothing, and no send path exists. The inbox offers copy-to-clipboard only.
- **A17c. `propose_next_best_action`** (`tools.ts` :835-885)
  - **Writes:** a `reed_suggestions` row with no payload.
  - **Human review:** accepting it only records the decision. No live record changes.
- **A17d. `propose_plan_element`** (`tools.ts` :990-1050)
  - **Writes:** a `reed_plan_proposals` row with status `proposed`. Its `fields` are free-form and not validated at write time.
  - **Human review:** yes. Accept (`app/api/reed/proposals/[id]/route.ts`, requires `org.manage`) inserts a real row into `plan_objectives`, `plan_goals`, `plan_initiatives` or `plan_kpis`.
  - **Undo:**
    - The plan row can be deleted through the admin plan DELETE routes. Nothing links that deletion back to the proposal.
    - Dismiss has no status guard, so it can relabel an already-accepted proposal while the plan row stays.
  - **Comment vs. code:** the tool description says the operator "edits" a proposal. No edit path exists.

#### A18. Next-best-action (fundraising)
1. **Location:** `POST /api/admin/fundraising/next-best-action`, which calls `runNextBestAction` (`lib/agents/next-best-action/agent.ts` :141).
2. **Trigger:** "Suggest next moves" or "Refresh" in `SuggestedMoves.tsx` on `/admin/fundraising/today`.
   - Requires the `ai.reed` entitlement.
   - 10 runs per 10 minutes.
   - The $20 wallet and the org cap apply.
3. **Output:** database writes plus cards in the UI.
4. **Writes:**
   - Existing open `fr_nba_suggestions` rows are set to `superseded`, then new rows are inserted as `suggested`.
   - `fr_agent_activity_log` and `ai_calls` are written.
   - **Undo:** PATCH `[id]` sets the row to applied or dismissed, with no status guard. Superseded rows cannot be restored.
5. **Human review:** yes, for any change to an opportunity.
   - "Apply" lets the user edit the suggestion, then PATCHes `/api/admin/opportunities/[id]`.
   - That PATCH **overwrites** `next_step` / `next_step_due`. An audit row keeps the before and after values, and there is no revert route.
   - It then pushes dealstage, name, amount and closedate to HubSpot. `next_step` is not pushed.
6. **Model and prompt:** `claude-sonnet-4-6` (`agent.ts` :14). Prompts are in `lib/agents/next-best-action/prompt.ts` (:12 and :30).

**Checks** (`parseRecommendations`):
- ids must belong to the candidate set
- enums are enforced
- numeric values are clamped
- text is truncated
- the voice sweep runs

#### A19. Next move and email draft
1. **Location:** `POST /api/admin/fundraising/next-move`, which calls `runNextMove` (`lib/agents/next-move/agent.ts` :153).
2. **Trigger:** the generate button in `NextMovePanel.tsx` on the donor and prospect profiles.
   - Requires the `ai.reed` entitlement.
   - 15 runs per 10 minutes.
   - The wallet and the org cap apply.
3. **Output:** database writes plus UI.
4. **Writes:**
   - Older `reed_next_moves` rows are set to `superseded`, and a new row is inserted with the action, rationale, channel, email subject and email body.
   - `fr_agent_activity_log` and `ai_calls` are written.
   - The decision (applied or dismissed) only changes rows that are still `suggested`.
5. **Human review:** yes. No code sends email.
   - "Copy email" and "Open in mail" (`mailto:`) leave the sending to a human.
   - "Make task" creates an `ops_tasks` row on a click.
6. **Model and prompt:** `claude-opus-4-8` (`agent.ts` :16). Prompts are in `lib/agents/next-move/prompt.ts` (:8 and :27).
   - The input dossier includes earlier AI output from `fr_prospect_briefs` (A21).

**Checks** (`parseNextMove`):
- the channel enum is enforced
- do-not-contact forces `note`
- the email is stripped unless the channel is email and contact is allowed
- text is truncated
- the voice sweep runs on the action and rationale only; the email subject and body are not swept

#### A20. Prospect discovery
1. **Location:** `POST /api/admin/fundraising/strategy/discover`, which calls `runProspectDiscovery` (`lib/agents/prospect-discovery/agent.ts` :105). It uses the web-search tool (at most 8 searches) and `submit_candidates`.
2. **Trigger:** "Discover" in `DiscoverPanel.tsx` on `/admin/fundraising/strategy/[key]`.
   - Requires the `ai.prospect_research` entitlement.
   - 8 runs per 10 minutes.
   - The wallet and the org cap apply.
3. **Output:** candidates in the UI. They are not saved.
4. **Writes:** `fr_agent_activity_log` and `ai_calls` only.
5. **Human review:** yes. "+ Add to bench" adds one candidate per click through `/api/admin/fundraising/prospects/add`.
6. **Model and prompt:** `claude-sonnet-4-6` (`agent.ts` :16). Prompts are at :49 and :64.

**Checks:**
- Rows without a name are dropped.
- The type enum is enforced.
- Fields are truncated.
- The voice sweep runs.
- Source strings are not checked to be URLs.
- Web-search fees are not counted toward cost.

#### A21. Funder research brief
1. **Location:** `POST /api/admin/fundraising/research/[id]`. It runs in the background (`waitUntil`) and calls `generateBriefForProspect`, which calls `runFunderResearch` (`lib/agents/funder-research/client.ts` :603). It uses web search (at most 20) and `submit_brief`.
2. **Trigger:** "Generate research brief" in `BriefPanel.tsx` on `/admin/fundraising/prospects/[id]`.
   - Requires the `ai.prospect_research` entitlement.
   - 5 runs per 10 minutes.
   - The wallet and the org cap apply.
3. **Output:** a database write, shown in the UI.
   - An in-app notification is created.
   - The triggering user gets an email from a fixed template. The email contains no AI text.
4. **Writes:** all with the service-role client:
   - `research_runs`
   - `fr_prospect_briefs`, inserted with status `draft`
   - `fr_agent_activity_log`
   - `ai_calls`
   - `notifications`

   Briefs are append-only. No route updates, approves or deletes them, and nothing writes the statuses `final` or `archived`.
5. **Human review:** none.
   - The brief is shown as soon as it is generated.
   - It feeds the next-move agent (A19).
   - It is shown on `DonorProfile`.
6. **Model and prompt:** `claude-opus-4-7` (`client.ts` :31). Prompts are in `lib/agents/funder-research/prompt.ts` (:15 and :218).
   - Context comes from the HubSpot mirror tables.

**Checks:**
- `assertBriefContent` checks only that the 9 top-level keys exist.
- `cleanVoiceDeep` runs.

**Comment vs. code:** a comment at `client.ts` :190-193 says the system prompt still asks for JSON in text, and that the user message overrides this.

### AI outside the app code: Cowork skills and the MCP endpoint

#### A22. `finance-balance` skill (`.claude/skills/finance-balance/SKILL.md`)
1. **Location:** the skill file. It runs through the Gmail and Supabase MCP connectors, using `execute_sql`.
2. **Trigger:** described as a scheduled Cowork task "each morning". The schedule is not in the repo.
3. **Output:** a database write.
4. **Writes:** directly to `fin_config`: `cash_starting_balance`, `cash_starting_date` and `cash_reconciled_at`.
   - There is no history table.
   - The values can be overwritten by hand in Finance → Config.
5. **Human review:** none.
   - The skill text sets limits: dates only move forward, the value must be between $0 and $10M, and the agent skips when unsure.
   - Those limits are instructions to the agent. They are not enforced in code.
6. **Model and prompt:** the Cowork agent's model. UNDETERMINED which model. The prompt is the skill file.

#### A23. `finance-reconcile` skill (`.claude/skills/finance-reconcile/SKILL.md`)
1. **Location:** the skill file.
2. **Trigger:** described as a scheduled Cowork task on Fridays. The schedule is not in the repo.
3. **Output:** proposals.
4. **Writes:** `fin_reconciliation_items` rows with `created_by 'agent'`.
   - Proposals can be dismissed.
   - An accepted commitment needs a manual edit or delete.
5. **Human review:** yes. Money reaches `fin_revenue_commitments` only when a person clicks accept (`app/api/admin/finance/reconciliation/[id]/route.ts`).
6. **Model and prompt:** the Cowork agent's model, UNDETERMINED which. The prompt is the skill file.

#### A24. MCP endpoint, used by an external AI agent
1. **Location:** `app/api/mcp/[secret]/route.ts`.
   - Auth is a secret in the URL path, compared with `!==` against `TASK_INGEST_SECRET`.
   - The comment says the caller is "Shannon's Claude Cowork morning run".
2. **Trigger:** MCP `tools/call`.
3. **Tools:**
   - **`create_task`** writes. It calls `ingestTask` (`lib/admin/ops/ingest.ts`), which inserts an `ops_tasks` row labelled `cowork`. The default assignee is Shannon. It also writes an audit row.
   - **`list_my_tasks`** only reads.
4. **Undo:** archive or delete the task.
   - The dedupe lookup is not filtered by org.
5. **Human review:** none before the insert.
6. **Model and prompt:** the route itself has no model. The title and description come from the upstream AI agent, whose model and prompt are not in this repo.

`POST /api/ingest/tasks` reaches the same `ingestTask` core: bearer `TASK_INGEST_SECRET`, at most 100 tasks per call. Its content also comes from an external agent.

---

## Part B. Automated actions with no model in the route

Unless a row says otherwise, these use no AI.

### Scheduling status

`vercel.json` schedules only four routes:

| Route | Schedule |
|---|---|
| `gmail-sync` | `45 * * * *` |
| `calendar-sync` | `*/15 * * * *` |
| `calendar-watch-renew` | `0 8 * * *` |
| `metric-snapshots` | `0 13 * * *` |

Six other cron routes exist with **no scheduler anywhere in the repo**: daily-reminders, hubspot-sync, journeys, meet-reminders, stewardship-milestones and weekly-digest.
- They are not in `vercel.json` or `.github/workflows`, and no `pg_cron` job targets them.
- `docs/cron-restoration-plan.md` :328-342 says they were removed on 2026-09-03 and are meant to come back in stages.
- Code comments in `journeys/route.ts` :8 and `stewardship-milestones/route.ts` :9 still say they run from `vercel.json`.

All `/api/cron/*` routes require `Bearer ${CRON_SECRET}`. Anyone who holds that secret can trigger any of them by hand.

### Inventory

| # | Location | Trigger | Output | Writes / undo | Human review |
|---|---|---|---|---|---|
| B1 | `app/api/cron/calendar-sync` → `lib/agenda/calendar-sync.ts` | Vercel `*/15`. The Google webhook (B14) runs the same code. | DB | Upserts `calendar_events`. Flows changes back to `ops_tasks.planned_day/week` and `work_blocks`. When an event is cancelled, it **deletes `work_blocks`** and `calendar_events` rows and clears plan days. No snapshot, no undo. | No |
| B2 | `app/api/cron/calendar-watch-renew` → `lib/google/watch.ts` | Vercel `0 8 * * *` | Registers Google Calendar push channels. DB: `connections.meta.watch`. | Channels expire after about 7 days. `stopCalendarWatch` exists. | No |
| B3 | `app/api/cron/daily-reminders` | No scheduler in repo (formerly `0 14 * * *`) | Plan metrics (`plan_kpis`, `plan_kpi_snapshots`, `metric_snapshots`). **AI** narrative pre-warm (A12). Resend email to the org's owner/admin allowlist, built from the `lib/email/deadline-reminders.ts` template. | Metrics are overwritten daily. Email cannot be recalled. | No |
| B4 | `app/api/cron/gmail-sync` → `lib/fundraising/gmail-sync.ts` | Vercel `45 * * * *` | DB, read-only on Gmail | Upserts `interactions` (`logged_by:"gmail"`, `is_private:false`): no delete route, only a PATCH of `is_private`. Upserts `connection_candidates` as pending (they can be dismissed). `gmail_sync_jobs`. | No for interactions. Candidates wait for a human. |
| B5 | `app/api/cron/hubspot-sync` → `lib/hubspot/sync-engine.ts` | No scheduler in repo (doc says "Held") | DB | `hs_*` mirror, `imports`, `hs_sync_jobs`. RPC `fr_sync_hubspot_to_spine` writes constituents, opportunities and gifts. No undo found. | No |
| B6 | `app/api/cron/journeys` | No scheduler in repo (formerly `15 * * * *`) | **Auto-sends** Resend email to constituents from human-written `journey_steps` templates | Upserts `journey_enrollments`. An enrollment can be cancelled and a journey paused. Sent email cannot be recalled. | Templates are written by a human. A journey is `active` as soon as it is created. No approval per send. |
| B7 | `app/api/cron/meet-reminders` | No scheduler in repo (formerly hourly) | Gmail API email to `bookings.attendee_email` from templates `reminder-24h` / `reminder-1h` | Sets `bookings.reminder_sent_*`. No undo. | No |
| B8 | `app/api/cron/metric-snapshots` | Vercel `0 13 * * *` | DB | `plan_kpis`, `plan_kpi_snapshots`, `metric_snapshots`, upserted once per day. Overwritten if rerun the same day. | No |
| B9 | `app/api/cron/stewardship-milestones` | No scheduler in repo (formerly `30 13 * * *`) | DB | Inserts `ops_tasks` (`sys:ack`, `sys:milestone:*`, `created_by:"system"`). The task can be archived or deleted. | The tasks are for a human to act on. No email is sent. |
| B10 | `app/api/cron/weekly-digest` | No scheduler in repo (formerly `30 14 * * 1`) | Metrics. **AI** briefing (A13). Resend email to every operator, with the AI text unescaped. | `briefings` insert. Email cannot be recalled. | No |
| B11 | pg_cron `capture-transcript-purge` (`capture_obligations.sql` :528-535) | `17 10 * * *` | DB | Nulls `captures.transcript` and `capture_cards.payload.source_sentence` after 90 days. Cannot be reversed. | No |
| B12 | pg_cron `audit-log-partitions` (`create_audit_log.sql` :59-75, `fix_audit_partition_rls.sql` :21-41) | `0 3 25 * *` | DB | Creates next month's `audit_log` partition and **drops the partition from 12 months ago**. Cannot be reversed. | No |
| B13 | DB triggers on `donations` (`create_fundraising_core.sql` :360-368; `dedupe_payment_gifts_against_deal_gifts.sql`) | Insert into, or status update on, `donations` | DB | Inserts create `constituents`, `recurring_plans` and `gifts` (`acknowledgment_status` is `pending` at $250 or more). Status `failed`/`refunded` **deletes the `gifts` row**. Status `cancelled` cancels the plan. | No |
| B14 | `app/api/google/calendar-webhook` | Google push | Same as B1 | Same as B1. The token check is skipped when no token is stored. | No |
| B15 | `app/api/webhooks/hubspot` | HubSpot webhook (HMAC v3, `timingSafeEqual`, 5-minute window) | DB | `webhook_events`, `hs_*` mirror. **Overwrites `constituents`** first/last name, emails, phones and org_name (`lib/hubspot/sync-in.ts` :47, :64). No before-snapshot, no undo. | No |
| B16 | `app/api/stripe-webhook` | Stripe webhook (signature verified) | DB, plus templated Resend alert emails to remi@ | Writes `donations` and `recurring_plans`, which fires B13. Handler errors still return 200. No undo. | No |
| B17 | `lib/fundraising/stewardship.ts` `autoSendReceipt` (:180-248) | A user creates a gift (`app/api/admin/gifts/route.ts` :142) and an `auto_email` rule matches | Resend email to the donor from `ack_templates` or a default note | `gifts.acknowledgment_status`, `acknowledgments` with `sent_by:"system"` | None per send. Migration `ack_v2_7_no_auto_send.sql` turned the seeded `auto_email` rules into `create_task`, but the code path still exists. |
| B18 | `app/api/hub/v1/snapshot` | GET from Trellis (bearer `HUB_SNAPSHOT_SECRET`) | Read-only JSON of `ops_projects` and `ops_tasks` | None | n/a |
| B19 | DB trigger `on_auth_user_created` (`create_membership_bootstrap.sql` :59-62) | New auth user | DB | Inserts `memberships` from `org_email_allowlist`, or as staff when the email domain matches | No |
| B20 | `.github/workflows/db-backup.yml` | cron `17 9 * * *` | Encrypted `pg_dump` artifact, kept 30 days | No writes to prod | n/a |
| B21 | `.github/workflows/db-migrate.yml` | `workflow_dispatch` only, with a human-entered filename | Production DDL | No built-in undo | The manual dispatch by a human is the review step |

For the human-sent email paths, `app/api/admin/comms/[id]/send` (segment campaigns) and `app/api/admin/acknowledgments/send`, the content is written by a human and an authenticated admin clicks send. No AI drafting route exists for comms.

---

## Part C. Generated text that reaches someone without passing a check

**What counts as a "check" here:** a human reads the text before it takes effect.
- The voice sweep only replaces em dashes, so it is not counted.
- Automated filters are noted where they exist, but they do not count as a check.
- "Outside person" means anyone other than the BloomOS operator who triggered the call.

### C1. To people outside the organization or the public

| Surface | Who receives it | Channel | Automated filter on the text |
|---|---|---|---|
| A1 career-match | Public quiz taker | On screen | None |
| A1, via `/api/quiz-submit` | The address the quiz taker typed | Resend email; AI fields placed in the HTML unescaped | None |
| A4 Built For summary | Public student | Results page, stored in `ms_sessions` | Length of 600 characters or less; a regex for 5 negative phrases |
| A5 room deliver prompts | The host's unverified typed address | Resend email; AI text placed in the HTML unescaped | None |
| A2 `/api/shannon` | shannon@ (the subject of the analysis) and remi@ | Resend email, escaped | None. The endpoint has no auth and no rate limit. |

No donor-facing email in the codebase carries AI text without a human step in between:
- Acknowledgment drafts (A6) are edited and sent by an operator.
- Next-move emails (A19) leave through the operator's own mail client.
- Reed drafts (A17b) have no send path.

### C2. To staff other than the person who triggered it, or into shared records

| Surface | Where the text lands |
|---|---|
| A10 report/debug, filed by a non-owner | An `ops_tasks` row and an operator email. The reporter never sees the prompt. |
| A12 morning briefing narrative | The shared briefing page. It overwrites the day's row. |
| A13 / B10 weekly digest | `briefings`, plus an email to every operator with the AI text unescaped. Nothing in the repo currently schedules the cron path. |
| A15 meeting transcript summary | Overwrites `meeting_records.summary`. |
| A17 Reed Ask answers | The asking user's screen, stored in `reed_messages`. |
| A21 funder research brief | Prospect and donor profiles, and the input to A19. |
| A24 MCP `create_task` / `/api/ingest/tasks` | `ops_tasks` assigned to Shannon. The text was written by an external AI agent. |
| A22 finance-balance skill | `fin_config` cash balance, which feeds every runway number. This is a number chosen by an AI, not text. |

---

## Part D. Could not determine

- Whether `CRON_SECRET` works in production today. `docs/interaction-capture-diagnostic.md` :179-191 recorded every cron call returning 401.
- Whether anything outside the repo calls the six unscheduled cron routes.
- The real schedule, enabled state and model of the Cowork tasks behind the `finance-balance` and `finance-reconcile` skills and the MCP morning run.
- How often Trellis polls `/api/hub/v1/snapshot`.
- Whether the production `stewardship_rules` table holds any `auto_email` row, which would make B17 live.
- Whether RLS scopes the `fr_agent_activity_log` read that computes the $20 fundraising wallet. The query itself has no org filter.
- Whether any database-side job cleans up `ms_sessions`, `ms_deliveries` or `quiz_submissions`. None was found, but not every migration was read in full.
