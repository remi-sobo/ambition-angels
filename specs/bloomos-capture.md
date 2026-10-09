# BloomOS Capture: say it once, confirm the cards

**Spec status:** Phase 0 complete (`docs/recon/capture-phase0.md`, branch `claude/pensive-einstein-sgcg5s`). Rulings below supersede anything they contradict further down. C1 is cleared to start once Remi accepts the rulings.
**Source of the pattern:** the Team Esface coach app redesign (`app/record.jsx`, `SU_DESIGN_PROMPT_RECORDER_TRUST.md`). We're porting the interaction contract, not the code, the brand, or the KPI scoring.
**Proposed path:** `specs/bloomos-capture.md`

---

## Phase 0 rulings (2026-10-08)

Each line answers one of the recon's 16 spec changes. "Recommended" means it's waiting on Remi's yes.

1. **Matcher builds on what exists.** `lib/capture/match.ts` is a session-client query over `constituents` (first, last, org_name) and `partners.name`, modeled on `meetings/[id]/connect/route.ts` and the scoring in `bloomos_search_people`. Never `resolveConstituent` (creates rows, ignores archived, no org pin). Never the global search route (it reads `students`). C1 adds `partners_name_trgm`.
2. **Universe is ~2,826 names, not 3,586.** The 756 nameless HubSpot-import rows are unreachable by voice and that's fine. Tune the near-tie hold on the Sobomehin family and the 32 exact-duplicate pairs, not on common first names. The 20-note DoD test set is recorded speech, not typed text.
3. **"Maria Chen from Koshland."** Person rows carry no employer, and `relationships` has 0 AA rows. An org name in the sentence becomes its own candidate span matched against `constituents.org_name` and `partners.name`. The interaction files to whichever single record the user confirms; the card shows both matches so they can choose. `fr_prospects` is a disambiguation hint only in V1. A prospect-only match can't become an interaction (interactions need a constituent); the card falls back to Task or Thought. Creating a constituent from voice is out of V1.
4. **Message drafts.** C1 adds `capture_message` to the `reed_drafts.kind` check, idempotently, following `add_strategy_review_draft_kind.sql`.
5. **RLS on the new tables covers select, insert, update, delete** with `created_by = auth.uid()` (uuid) plus `has_permission(org_id, 'ops.read')` for select and `'ops.write'` for writes. This is what lets the whole feature stay on `createServerSupabase()`. The meetings pipeline went service-role because its staging table was select-only; we don't copy that.
6. **Cap and ledger.** Route checks `orgOverAICap` and returns 429 when over (402 stays the entitlement signal). Route writes `logAICall` with `surface: 'capture'`. New per-user rate limit, 30 parses per hour, implemented as a count of the caller's `captures` rows in the last hour (no new infra).
7. **Gateway.** `generateStructured` with a `submit_capture_cards` tool. `cleanVoiceText` runs in the validator on prose fields only (interaction notes, task title, draft body), never on names, dates, or handles.
8. **Task cards.** Category chosen from `TASK_CATEGORIES`, fallback `other`. Set both `assigned_to` (handle) and `assigned_to_id` (uuid). Assignee candidates are org members holding `ops.write`.
9. **HubSpot mirror: recommend no.** HubSpot is staging-only and being retired, and the spine is the system of record. Capture-filed interactions don't call `pushInteractionToHubSpot`. That keeps the feature off the service-role client entirely and avoids adding new traffic to a sync we're removing. **Remi's call.**
10. **Obligations arm.** One row per `captures` row with pending cards, `contains_participant_data = true` (free-text precedent), all six app-side edit points listed in C5, plus `resolve_obligation` and `snooze_obligation` branches.
11. **Seed before gate.** `ai.capture` rows for `ambition-angels` and `young-gifted-black` ship in C1 and are applied before C2's route deploys.
12. **Apply path.** The live ledger shows recent migrations recorded with `name` = filename stem (e.g. `spec_fr_next_step_obligations`), so whatever path Remi used in September writes the ledger. C1's file is `supabase/migrations/capture_tables.sql`, and Remi applies it the same way so `migration-ledger.yml` stays green. **Remi to confirm which path that is.**
13. **Retention.** Cron is healthy now: 24 `gmail_sync_jobs` in the last 24 hours, one per hour. So the 90-day transcript purge ships as a cron in C5. C1 just carries `transcript` and `created_at`.
14. **Speech hook.** C4 builds `useContinuousSpeech` as a new hook (auto-restart on silence end, accumulated transcript, interim display and flush on stop, visible errors, timer, 4-minute cap, single recognizer). ReportModal keeps the old hook untouched.
15. **Current behavior** gains the donor "+ Log" form (1 AA row ever) and partner "+ Log touch" (0 AA rows ever). The appliers reuse those routes' validation rules; the partner applier also bumps `partners.last_touch_at`.
16. **`v_obligations` grant drift** goes in `docs/schema-drift-audit.md`, not this spec.

---

## The short answer: should we?

Yes, with two conditions.

**Why yes.** The live data makes the case better than the design does. In the last 60 days AA logged 535 interactions, and all 535 came from the Gmail sync. Zero calls, zero in-person meetings, zero notes were logged by a human. The coffee with a funder, the call with a principal, the hallway conversation at a board event: none of it lands anywhere unless it happened in email. That's the most valuable relationship data an ED produces, and BloomOS currently captures none of it. Spec B already names "capture, logging an interaction" as the mobile job, but the mobile ＋ today only offers Add task, Report an issue, and Reed.

It also travels. Every small-nonprofit ED has this exact problem, and "talk for 30 seconds after a meeting, confirm three cards" is a Grow-tier feature you can demo in one minute.

And most of the plumbing exists: `useSpeechRecognition` (powers the mic in ReportModal), the meetings pipeline that already does transcript → Reed parse → staged suggestions a human accepts, `reed_plan_proposals` with its `applied_id` trail, the V2 Quick Add FAB and mobile ＋ sheet, the obligations view that feeds Today, and `pg_trgm` already installed for name matching.

**Condition 1: name matching is the product, and BloomOS's is harder than Esface's.** Esface matches a spoken name against a few hundred families on a coach's roster. AA has 3,586 constituents plus partners, and the app-side matcher (`lib/meetings/match.ts`) matches email addresses only. (Phase 0 found trigram name search already live in the database; see ruling 1. Full-name baseline: right row first in 10 of 10.) If the "Which Reggie?" card fires on every third item, or worse, a confident wrong match files a note on the wrong donor, people stop trusting it in a week. Phase 0 has to measure this before we build UI.

**Condition 2: V1 stays out of youth data.** SafeSpace's agreement (Sections 7, 8, 9) restricts AI processing of youth data and requires separation between fundraising and program staff. The trust docs say a ZDR agreement with Anthropic is still pending and required before student PII enters prompts. So V1 routes to donors, partners, tasks, and drafts only. No student or participant destinations, no student names in the matcher's candidate set. That's a ruling to write down, not a TODO.

---

## Problem statement

An ED on the move has conversations all day that should change the record: a donor signaled a bigger gift, a partner wants to add a school, a board member offered an intro. Today the only way to capture that is to open the right record on a phone, find the right form, and type. Nobody does it, which the interaction data proves. The information lives in the ED's head and leaks out over the week.

## Who's affected

- **Remi (AA CEO):** the primary user. Between meetings, in the car, walking out of a coffee.
- **Shannon (AA ops):** receives the tasks that come out of Remi's captures, and benefits from interactions being on the record at all.
- **Tenant EDs (YGB, Young Life EPA, future tenants):** same problem, same feature, behind an entitlement.
- **SafeSpace:** explicitly not affected in V1. The entitlement stays off for them.

## Current behavior

- Mobile ＋ (`V2MobileBar`) and desktop Quick Add (`V2QuickAdd`) offer Add task, Report an issue, Search, Ask Reed. No capture.
- `useSpeechRecognition` (Web Speech API, browser-native, no audio upload) is used only by ReportModal.
- Meetings: a pasted transcript on a meeting record goes through `parseTranscript` (Reed) and produces 1 to 3 `meeting_suggested_tasks`, linked to the meeting's primary attendee by email match. Accept turns one into an `ops_tasks` row.
- `interactions` (constituent timeline): written only by Gmail sync in the last 60 days. `kind` is checked to `call | email | meeting | event | note`.
- Reed's write tools are inert proposals that a human accepts. Reed cannot write directly.

## Desired behavior

From anywhere in BloomOS (mobile ＋, desktop Quick Add, and an entity page with context pre-filled), the ED taps **Record**, talks, taps stop. Within about ten seconds they see "Here's what I heard": a stack of cards, each with a destination tag, the matched person or org, the text, and what will happen on confirm. They confirm, edit, or discard each one, or Confirm all. Nothing writes to a real record until they confirm. A card whose name match is uncertain sits at the top as "Which Maria?" with the candidates, and it can't be confirmed until they pick.

Example: "Just had coffee with Maria Chen from the Koshland Foundation. She wants the impact numbers before their November board meeting. Have Shannon send her the one-pager by Friday. Also she mentioned Peninsula Community Foundation is opening a youth workforce round."

Produces:
1. **Interaction · Maria Chen** · Meeting · "Coffee. Wants impact numbers before their November board meeting." → `interactions`
2. **Task · Shannon** · "Send Maria Chen the impact one-pager" · due Fri Oct 9 · linked to Maria Chen → `ops_tasks`
3. **Thought · parking lot** · "Peninsula Community Foundation opening a youth workforce round. Look into it." → `ops_tasks`, no due date, `parking-lot` label

## Scope

**In (V1)**
- Record entry point in mobile ＋ sheet, desktop Quick Add, and entity pages (constituent, partner, opportunity) with that entity as context.
- Recording via Web Speech API (existing hook), with a type-or-paste fallback that runs the same pipeline.
- Parse: one structured Claude call per capture through `lib/ai/gateway.ts`, logged to the `ai_calls` ledger and the per-org cap.
- Name matcher over constituents and partners the user can read (RLS session client), using `pg_trgm` plus first/last/org-name heuristics, with the context entity as a strong prior.
- Card destinations: **Interaction** (constituent → `interactions`; partner → `partner_interactions`), **Task** (`ops_tasks`, with assignee, due date, linked entity), **Thought** (`ops_tasks`, no due, `parking-lot` label), **Message draft** (`reed_drafts`, never sent).
- Confirm screen: per-card Confirm / Edit / Discard, Confirm all, low-confidence pick card pinned top, see transcript, Undo on a confirmed card within the session.
- Unconfirmed cards persist. If you close the app, they're waiting on Today as a needs-you item.
- Filed rows carry provenance (`capture_card_id` reachable from the row) so the history shows "from a recording" and the original transcript is one tap away.

**Out (V1)**
- Any student, participant, cohort, or attendance destination. Students excluded from the matcher candidate set.
- Writes that modify existing records (opportunity stage, ask amount, next step). Read the "Open decisions" section; this is the most tempting V1.5.
- Storing audio. Server-side speech-to-text (new subprocessor).
- Offline recording queue. (Chrome's Web Speech needs network anyway.)
- Esface's KPI counting and score animation. BloomOS has the metric catalog; if captures should count toward a KPI, that's a metric definition, not recorder code.
- Fix-after-confirm (edit / move / remove from the record with provenance). Real and important, it's C6 below, but it ships after V1 proves the matcher.
- Sending anything. Drafts stay drafts.

## Architecture sketch

**Two new tables**, both org-scoped from session context, RLS on in the same migration.

`captures`: one row per recording.
- `id`, `org_id` (no default; set from `getOrgContext()`), `created_by` (auth.uid), `created_at`
- `source_surface` (`mobile_plus | quick_add | entity_page | paste`), `context_type`, `context_id` (the entity page it started from, nullable)
- `transcript text` (see retention decision), `duration_seconds`, `status` (`parsing | ready | done | failed`), `parse_error`, `model_used`, `ai_call_id`

`capture_cards`: one row per proposed filing.
- `id`, `org_id`, `capture_id` (fk, cascade), `position`
- `dest` (`interaction | task | thought | message_draft`), check-constrained
- `payload jsonb` (text, kind, due, assignee, etc.)
- `entity_type` (`constituent | partner | null`), `entity_id`, `heard_name`, `match_confidence numeric`, `match_candidates jsonb`
- `status` (`proposed | held | confirmed | discarded`), `decided_by`, `decided_at`
- `applied_table`, `applied_id` (the real row it became; same pattern as `reed_plan_proposals.applied_id`)

RLS on both: select with `has_permission(org_id, 'ops.read')`, insert/update/delete with `has_permission(org_id, 'ops.write')`, all AND `created_by = auth.uid()` (ruling 5). Captures are personal. An ED's raw voice notes about donors shouldn't be readable by every ops user. (Open decision if Shannon needs to see Remi's pending cards.)

**Applying a card re-checks the destination's own permission**, because the destinations live in different permission domains (live policies, read 2026-10-08):
- `interactions`, `constituents` → `fundraising.read/write`
- `partner_interactions`, `partners` → `program.read/write`
- `ops_tasks` → `ops.read/write`
- `reed_drafts` → membership only (note: this is weaker than the `has_permission` floor; flag for the security backlog, not this spec)

Apply runs through the user-session client so RLS does the enforcing. No service-role client anywhere in this feature. If the user can't write the destination, the card says so and can't be confirmed.

**Provenance on the destination rows.** Smallest reversible option: `interactions.external_source = 'capture'`, `external_id = capture_card_id` (fits the existing unique index pattern); `ops_tasks.origin_path = '/admin/capture/<capture_id>'` plus a `capture` label. No new columns on hot tables. Phase 0 confirms `partner_interactions` and `reed_drafts.context_ref` can carry the same.

**Pipeline (`POST /api/admin/capture`)**
1. Gate: `requireEntitlement('ai.capture')` → 402. Auth → 401.
2. Insert `captures` row (`parsing`).
3. Candidate pass: cheap extraction of capitalized name spans plus the context entity. Query constituents and partners via the session client with `similarity()` over name fields, top N per span. Students are never queried.
4. One structured Claude call (Sonnet via gateway, voice sweep off): transcript, today's date and timezone, the user's name, org staff list (for assignees), the context entity, and the candidate list with ids. Model returns cards and picks candidate ids from the list. It can't invent an id; anything not in the list is "unmatched".
5. Server validates every card: dest in enum, ids exist in the candidate set, dates parse, assignee is an org member. Confidence below threshold (named constant, start at 0.75) or two candidates within 0.1 → `held`.
6. Insert cards, set capture `ready`, return.

Pure prompt builder in `lib/capture/prompt.ts` (no I/O, unit-tested like `lib/meetings/transcript-prompt.ts`). Matcher in `lib/capture/match.ts`, tested against fixtures.

**Confirm (`POST /api/admin/capture/cards/[id]`)** with `action: confirm | discard | undo | edit`. Confirm applies via a per-dest applier, writes `applied_table/applied_id`, idempotent (a second confirm returns the existing applied row). Undo deletes the applied row only if it's unchanged since apply and was created within the session window, then sets the card back to `proposed`.

**Today.** Add a `capture_cards` branch to the obligations view: one obligation per capture with pending cards ("3 cards waiting from your 2:14 PM recording"), `security_invoker=on`, scoped to `created_by = auth.uid()`.

**UI** in BloomOS's V2 system (navy chrome, orange accent, Big Shoulders / Poppins / DM Sans), not Esface's tokens. Screens to port in spirit: Recording (timer, live transcript, stop button, Paste link), Processing ("Sorting it out", step labels, never a blank spinner), Confirm stack, Pick-a-match card, Edit sheet, Mic denied, Speech failed. 390px first, 52px targets.

**Entitlement.** New key `ai.capture`, seeded on for AA and YGB. Separate from `ai.reed` on purpose: SafeSpace could move to Grow someday, and capture should still need its own explicit switch given their AI-processing terms. Tier packaging stays in data.

## Staged build order

Each stage is one PR, small radius, reversible.

**Phase 0 · Recon gate (read and report, no code).** See kickoff prompt below. Stops for Remi's review.

**C1 · Migration.** `captures`, `capture_cards`, full RLS (ruling 5), `partners_name_trgm`, `capture_message` added to `reed_drafts.kind`, `ai.capture` entitlement rows for AA and YGB, `ai.capture` added to `FEATURE_KEYS`. Idempotent (`if not exists`, satisfies `tests/migrations.test.ts`), no `org_id` default, passes `rls-leak-test.sql` with a new cross-tenant assertion. Hand Remi SQL; he applies it.
Commit: `capture: tables, rls, entitlement`

**C2 · Matcher and parse, no UI.** `lib/capture/match.ts`, `lib/capture/prompt.ts`, `POST /api/admin/capture`, validation, ledger. Tests: matcher fixtures (exact, nickname, two Marias, org-name-only, no match), prompt builder, validator rejects invented ids and student refs.
Commit: `capture: matcher and parse route`

**C3 · Apply.** Card action route, four appliers, idempotency, undo, provenance. Tests per applier, including permission-denied paths through the session client.
Commit: `capture: confirm, discard, undo`

**C4 · Record and confirm UI.** Record entry in mobile ＋ and Quick Add, hidden without `ai.capture`. Recording, processing, confirm, pick-a-match, edit, mic-denied, failed states. Type/paste path.
Commit: `capture: record and confirm screens`

**C5 · Context and Today.** Record from constituent, partner, opportunity pages with context prior; obligations view branch for pending cards.
Commit: `capture: entity context and needs-you`

**C6 · Fix after confirm (separate small spec).** From an entity history row that came from a capture: Edit, Move to another person (same matcher), Remove, with the original transcript reachable and an "edited" stamp.
Commit: `capture: fix after confirm`

## Definition of done (V1 = C1 through C5)

- Remi records a 30-second note on his phone after a real meeting and clears the cards in under a minute.
- On a test set of 20 real-style notes (Phase 0 builds it from AA's actual constituent names), the matcher picks the right record or correctly holds for a pick on at least 18, and files to a wrong record on zero.
- Nothing writes to `interactions`, `partner_interactions`, `ops_tasks`, or `reed_drafts` without a confirm click. Verified by a test that runs the parse route and asserts those tables are untouched.
- A user in org B can't see, match against, or apply into org A. Verified in `rls-leak-test.sql`.
- No student row is ever read by the capture pipeline. Verified by a test.
- SafeSpace and Young Life EPA see no Record affordance and get 402 from the route.
- Every parse is in `ai_calls` with cost; the org cap applies.
- Closing the app mid-confirm loses nothing; pending cards show on Today.
- Voice rules hold in generated card text (no em dashes; gateway sweep or validator).

## Failure modes

- **Confident wrong match.** The worst one: a note lands on the wrong donor and nobody notices. Mitigations: model picks from a server-built list only, threshold + near-tie hold, context-entity prior, the matched name and a disambiguating meta line ("Koshland Foundation · last touch Sep 12") shown on every card, provenance so C6 can fix it.
- **Invented facts.** Model adds an amount or a date nobody said. Mitigation: prompt forbids it, validator strips fields not grounded in the transcript where checkable, card always shows the source sentence on tap.
- **Web Speech on iOS.** I'm not sure how reliable `webkitSpeechRecognition` is in an installed iOS PWA running standalone. It has had problems there historically. Phase 0 tests it on Remi's actual phone. If it fails, the type/paste path still works and the STT decision below gets forced.
- **Speech cuts off.** Browser recognition stops after silence. The hook must auto-restart while the user is still in the record screen, and the transcript-so-far is never lost.
- **Mic denied.** Real screen with the type-instead path and how to re-enable.
- **Parse fails or times out.** Transcript is already saved on `captures`; Retry and type-instead; never a dead end.
- **Double tap on Confirm.** Idempotent applier.
- **Second-tenant leak.** `org_id` from session, no defaults, RLS on both tables from day one, session client only.
- **Youth data.** A user says a student's name anyway. It's in the transcript, and it goes to Claude. The matcher won't match it and no card can file to a student, but the text still left the building. This is why `ai.capture` stays off for SafeSpace and why the ZDR question matters before any program destinations exist.
- **Cost.** One Sonnet call per capture, small. A runaway loop is the risk, so per-user rate limit on the parse route (e.g. 30 per hour).

## Open decisions

1. **Speech-to-text approach.** Recommend V1 on the browser Web Speech API (free, already in the codebase, no audio leaves the device, no new subprocessor). Alternative is MediaRecorder + server STT (better accuracy, works offline-then-upload, but adds a vendor and audio storage, and Anthropic's API doesn't transcribe audio). Decide after Phase 0's iPhone test.
2. **Transcript retention.** Meetings stores transcripts only on opt-in. For captures I'd store by default (the "see transcript" and fix-after-confirm trust both need it), private to the creator, purged after 90 days by a cron once `CRON_SECRET` is fixed. Or follow the meetings precedent and make it opt-in.
3. **Who can see pending cards.** Recommend creator-only. If Remi wants Shannon to clear his cards, add an explicit share later.
4. **Entitlement key.** Recommend new `ai.capture` over riding `ai.reed`, for the SafeSpace reason above.
5. **Opportunity updates in V1.5.** "She's thinking $25K, not $10K" is the highest-value sentence an ED says, and V1 only logs it as an interaction. Updating `opportunities.ask_amount` or `next_step` from voice is a separate, careful spec because it changes forecast numbers.
6. **Program destinations.** Partner interactions are in V1 (they're `program.*` permissioned, not youth data). Student and participant notes wait on the ZDR agreement and the participant spine (Spec #4).
7. **Name.** "Capture" in code. In the UI, "Record" on the button and "Here's what I heard" on the confirm screen, same as Esface. Lives in `org_terminology` if a tenant wants different words.

---

## Phase 0 kickoff prompt (paste into Claude Code)

```
Read-and-report only. Do not write code, do not create migrations, do not open a PR.

Context: we're specing "Capture" for BloomOS. The ED taps Record, talks, and gets a
stack of proposed cards (interaction, task, thought, message draft) to confirm before
anything writes. The spec is specs/bloomos-capture.md (I'll add it to the repo).
Before we build, I need you to confirm or correct these facts against the real repo
and the live database (Supabase project kzzdtibbwsucloaoqpqa). Report each as
CONFIRMED, CORRECTED (with what is true), or UNKNOWN.

1. Speech hook. Read lib/hooks/useSpeechRecognition.ts and its use in
   app/admin/_components/ReportModal.tsx. Does it auto-restart after the browser
   ends recognition on silence? What happens to interim text on stop? List what
   would need to change to support a 2 to 4 minute continuous note.

2. Entry points. Read app/admin/_components/v2/V2MobileBar.tsx (the ＋ actions sheet)
   and v2/V2QuickAdd.tsx. Describe exactly where a "Record" action would slot in and
   how the existing items are gated (reedEnabled, entitlements).

3. Existing parse pattern. Read app/api/admin/meetings/[id]/transcript/route.ts,
   lib/meetings/reed.ts, lib/meetings/transcript-prompt.ts, and the accept path for
   meeting_suggested_tasks. Which pieces can Capture reuse as-is, and which use the
   service-role client (getSupabaseAdmin) that Capture must not copy?

4. Gateway structured calls. Does lib/ai/gateway.ts support structured/JSON output
   today, and how do callers record to ai_calls (lib/ai/ledger.ts) and the org cap
   (lib/ai/cap.ts)? Give the exact call shape Capture should use.

5. Name matching feasibility. Using execute_sql (read-only), for AA
   (org 17c75da8-082d-4c8f-b00b-a4100fb2eb22):
   a. How many constituents share a first name with at least one other constituent?
      Top 15 most-shared first names with counts.
   b. How many constituents are type=organization vs person, and how are org names
      stored (org_name vs first/last)?
   c. Confirm pg_trgm is installed and whether any trigram index exists on
      constituents or partners name columns.
   d. Pick 10 constituents AA has emailed in the last 30 days (from interactions
      where external_source='gmail'). For each, run similarity() of the first name
      alone and of "first last" against all AA constituents and report the rank of
      the correct row. This is our matcher baseline.

6. Destination tables. Confirm for interactions, partner_interactions, ops_tasks,
   reed_drafts: columns, check constraints, unique indexes, RLS policies and which
   permission each uses, and any org_id column default (use pg_attrdef, not
   information_schema). Confirm interactions.external_source='capture' with
   external_id=<card uuid> fits the existing unique index. Confirm
   ops_tasks.origin_path and labels can carry provenance.

7. Obligations view. Read the current definition of the obligations view
   (supabase/migrations/spec_fr_next_step_obligations.sql and anything later).
   Describe what adding a capture_cards branch requires, including security_invoker.

8. Entitlements. List org_entitlements rows by org for ai.* keys. Confirm how a new
   key (ai.capture) gets registered in lib/admin/entitlements.ts and whether unknown
   keys default OFF.

9. Students fence. Identify every place a constituent-or-partner search helper
   could also reach students, so the Capture matcher can be written to never touch
   them.

10. Anything in the repo that already does voice capture, quick logging of an
    interaction, or "log a call" that I'm missing.

Output: a single report at docs/recon/capture-phase0.md with a section per item,
then a short "Changes to the spec" list. Stop there for my review.
```

---

## C1 kickoff prompt (paste into Claude Code)

```
Build stage C1 of specs/bloomos-capture.md: the Capture migration and nothing else.
Read the spec's "Phase 0 rulings" section and docs/recon/capture-phase0.md first.
Branch from main. One PR. Do NOT apply the migration to any database, do NOT call
apply_migration or execute_sql with DDL. I apply it myself.

Also commit specs/bloomos-capture.md (I'll paste the current version) and
docs/recon/capture-phase0.md into this PR so the spec and its recon live with the code.

1. supabase/migrations/capture_tables.sql, fully idempotent (if not exists /
   drop policy if exists / on conflict), satisfies tests/migrations.test.ts and
   supabase/tests/tenant-default-ratchet.sql. No org_id column default anywhere.

   a. public.captures
      id uuid pk default gen_random_uuid(),
      org_id uuid not null references orgs(id) on delete cascade,
      created_by uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      source_surface text not null check in ('mobile_plus','quick_add','entity_page','paste'),
      context_type text check in ('constituent','partner','opportunity') (nullable),
      context_id uuid (nullable),
      transcript text,
      duration_seconds int,
      status text not null default 'parsing' check in ('parsing','ready','done','failed'),
      parse_error text,
      model_used text,
      ai_call_id uuid (nullable, no FK unless ai_calls.id is a stable uuid pk; check)
      Index (org_id, created_by, created_at desc).

   b. public.capture_cards
      id uuid pk, org_id uuid not null, capture_id uuid not null references
      captures(id) on delete cascade, created_by uuid not null default auth.uid(),
      position int not null,
      dest text not null check in ('interaction','task','thought','message_draft'),
      payload jsonb not null default '{}',
      entity_type text check in ('constituent','partner') (nullable; never 'student'),
      entity_id uuid, heard_name text, match_confidence numeric,
      match_candidates jsonb not null default '[]',
      status text not null default 'proposed' check in ('proposed','held','confirmed','discarded'),
      decided_by uuid, decided_at timestamptz,
      applied_table text check in ('interactions','partner_interactions','ops_tasks','reed_drafts'),
      applied_id uuid, created_at, updated_at.
      A check or trigger that capture_cards.org_id equals its capture's org_id
      (pick the simpler that passes the RLS test harness; explain the choice).
      Index (capture_id, position) and (org_id, created_by, status).

   c. RLS enabled on both. Policies (select / insert / update / delete), each:
      private.has_permission(org_id, 'ops.read') for select,
      private.has_permission(org_id, 'ops.write') for insert/update/delete,
      AND created_by = auth.uid(). Use the (select ...) wrapping style the live
      policies use. Insert/update need WITH CHECK.

   d. create index if not exists partners_name_trgm on partners using gin (name gin_trgm_ops),
      matching how bloomos_global_search_phase3.sql references the extension schema.

   e. Add 'capture_message' to the reed_drafts.kind check, following
      add_strategy_review_draft_kind.sql exactly (drop and re-add, idempotent).

   f. Seed ai.capture = true for orgs with slug in ('ambition-angels','young-gifted-black'),
      source 'seed:capture', copying seed_aa_ai_prospect_research.sql's upsert.

   g. updated_at triggers if the repo has a shared helper; otherwise skip and say so.

2. lib/admin/entitlements.ts: add "ai.capture" to FEATURE_KEYS. Nothing else in app code.

3. Register the migration in scripts/test-rls.sh's ordered array.

4. supabase/tests/rls-leak-test.sql: add a capture block modeled on the existing
   blocks. Assert: user in org B cannot select/insert/update captures or cards in
   org A; user A cannot see another org-A user's captures; a board_viewer in A
   (no ops.write) cannot insert; anon sees nothing; a capture_card cannot point
   at a capture in another org.

5. tests/capture-migration.test.ts (vitest text test): file is idempotent, has no
   org_id default, enables RLS on both tables, has four policies per table, and the
   string 'student' appears nowhere in capture_cards' entity_type check.

6. Run npm run lint, typecheck, npm test. Do not run anything against production.

Deliver: the PR, plus the full SQL of capture_tables.sql pasted in the PR body under
"SQL for Remi to review", and a 5-line note on anything in this prompt that didn't
match the repo. Stop there.
```
