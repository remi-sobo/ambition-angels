# Capture Phase 0 recon

Read-and-report for `specs/bloomos-capture.md` (the "say it once, confirm the cards" spec). No code, no migrations, no PR.
Date: 2026-10-09. Repo `main` = `8aaade1`. Live schema and data read from Supabase project `kzzdtibbwsucloaoqpqa` with read-only SQL.

Each numbered section answers the matching item in the spec's Phase 0 kickoff prompt. Claims the spec makes are marked **CONFIRMED**, **CORRECTED** (with what is true), or **UNKNOWN**. The last section lists what the spec should change before C1 starts.

**Verdict up front.** The spec's architecture holds. Four things it did not know:

1. A trigram name search already exists in production (`bloomos_search_people` RPC plus GIN trigram indexes on `constituents.first_name / last_name / org_name`). The spec can build the matcher on it instead of from scratch. On the ten-name baseline below, full-name similarity ranks the right row first every time, and first-name-only similarity ties on exact matches for 8 of 10, so the "hold on near-tie" rule fires exactly where it should.
2. The hardest matcher input is not "two Marias." It is the 756 AA person rows that have no name at all (email-only HubSpot imports), the 32 exact duplicate full-name pairs already in the table (one of them is a live family member, `Kendra Sobomehin` x2), and the 1,032 organization rows whose names cluster tightly (1,490 org-name pairs at similarity 0.6 or above).
3. `reed_drafts.kind` is check-constrained to five report kinds. There is no message kind. The Message draft destination needs a one-line constraint change in C1.
4. The meetings pipeline the spec wants to "reuse" runs on the service-role client and a raw `fetch` to the Anthropic API, bypassing the gateway, ledger, and cap. Capture can copy its shape but none of its plumbing. The reason it went service-role is instructive: `meeting_suggested_tasks` has a SELECT-only RLS policy, so the session client could never stage or accept. `captures` and `capture_cards` must ship with insert and update policies or the spec's "session client only" rule is unmeetable.

---

## 1. Speech hook

Files: `lib/hooks/useSpeechRecognition.ts` (150 lines), consumer `app/admin/_components/ReportModal.tsx:296, 347, 506-528`.

**Configuration.** One recognizer per hook mount: `rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true` (`useSpeechRecognition.ts:72-75`). Constructor detection covers `window.SpeechRecognition ?? window.webkitSpeechRecognition` (`:42-49`); a missing constructor sets `supported = false` and the mic button renders nothing (`ReportModal.tsx:508`).

**Does it auto-restart after the browser ends recognition on silence? CONFIRMED: no.**

```ts
// lib/hooks/useSpeechRecognition.ts:104-107
rec.onend = () => {
  setListening(false);
  setInterim("");
};
```

No restart loop, no "still want to listen" ref. When Chrome or Safari ends the session after its silence window, the button goes grey and the user must tap again. `onerror` likewise ends listening on every code (`:93-103`).

**What happens to interim text on stop? CONFIRMED: dropped.** `onresult` (`:77-92`) forwards only `isFinal` chunks to `onResult`; interim text sits in `interim` state. `stop()` (`:132-142`) calls `rec.stop()` then `setInterim("")` immediately. Browsers usually fire one trailing final result after `stop()`, so most tail words survive, but anything that never finalizes is lost, and the hook never merges interim into the final stream. ReportModal never renders `interim` at all (it destructures `{ supported, listening, error, toggle }` only, `ReportModal.tsx:507`).

**How ReportModal consumes it.** Appends final chunks to a controlled textarea via `joinSpeech` (`ReportModal.tsx:428-433`), which fixes spacing and capitalizes only the first chunk. The hook owns no transcript; the caller does.

**Error surfacing today.** `not-allowed` / `service-not-allowed` set a specific message; `network`, `audio-capture` and others get "Voice input hit a snag"; `no-speech` and `aborted` are swallowed. The only consumer shows `error` as the button's `title` tooltip (`ReportModal.tsx:514`). On a phone that is invisible.

**What must change for a 2 to 4 minute continuous note:**

1. Auto-restart in `onend` while a `wantListeningRef` is true (small `setTimeout` before `rec.start()` avoids `InvalidStateError` on Safari). Treat `no-speech` and `aborted` as restart conditions, not terminal ones.
2. An accumulated transcript that survives restarts. Either the screen owns it (ReportModal pattern) or the hook grows a `transcript` state. `resultIndex` resets per session, so the existing delta loop stays correct.
3. Flush or wait on interim at stop. Snapshot `interim` and append it, or wait for the trailing final result before marking the note complete.
4. Render `interim` live (grey) after the finals. The hook already exposes it.
5. Visible error states. The shell has a `ToastProvider` (`app/admin/layout.tsx:114`). Distinguish `not-allowed` (stop, show settings path) from `network` (retry) from `no-speech` (keep going).
6. A timer and a hard cap (4 to 5 minutes) to bound transcript size and cost. Nothing exists today.
7. One recognizer per screen (ReportModal mounts two).
8. Fix the stale-closure check in `start` (`if (!rec || listening) return`, memoized on `[listening]`, `:119-130`); a restart from `onend` must check a ref.

**iOS standalone PWA. UNKNOWN until tested on Remi's phone.** The admin layout declares `appleWebApp.capable: true` (`app/admin/layout.tsx:44-48`), so the installed app runs in a standalone WKWebView. Known hazards: Safari ignores `continuous` on some versions (restart loop becomes essential, not optional); `start()` outside a user gesture can return `not-allowed`; backgrounding or screen lock ends the session silently; mic permission in a standalone install may not re-prompt. The type-or-paste path is the floor if any of this fails.

## 2. Entry points

**Shell wiring (server).** `app/admin/layout.tsx:86-92` computes `ents = await getEntitlements(orgId)` and `reedEnabled = hasFeature(ents, "ai.reed")`, then passes `reedEnabled` as a prop to both `<V2MobileBar>` (`:147`) and `<V2QuickAdd>` (`:150`) inside `<ReedLauncherProvider enabled={reedEnabled}>`. The pattern is one boolean prop per gated action. A `captureEnabled` boolean computed the same way at `:92` is the slot.

**Mobile ＋ sheet** (`app/admin/_components/v2/V2MobileBar.tsx`). The center 44px orange button opens `sheet === "actions"` (`:139-155`); the sheet is a plain stack of `<ActionRow>` (52px min height, `:336-364`). Current rows in order:

| # | Title | Gate | Opens |
|---|---|---|---|
| 1 | Ask Reed | `reedEnabled &&` (`:266`) | `openReed({ surface: "v2-mobile-plus" })` |
| 2 | Add task | none | `setModal("task")` → `QuickAddModal` |
| 3 | Message someone | `hasMessages` (`:105`, inbox nav has a messages tab) | `router.push("/admin/messages")` |
| 4 | Report an issue | none | `setModal("report")` → `ReportModal` |

Modals are local `useState<"task" | "report" | null>` (`:330-331`) rendered inline, no portal; each modal is `fixed inset-0 z-50` itself. Record slots in as row 2 (under Ask Reed, above Add task) gated on the new prop, with `"record"` added to the modal union. The More sheet (`:182-254`) duplicates Report and Reed; Record can be duplicated there to match.

**Desktop Quick Add** (`app/admin/_components/v2/V2QuickAdd.tsx`). `hidden lg:flex` FAB (`:88-100`). Chips in source order (`:65-84`): Ask Reed (`reedEnabled &&`), Search ⌘K (dispatches `bloomos:search:open`), Report an issue, Add task. Same local modal state (`:102-103`).

**Shared or duplicated? CONFIRMED: duplicated.** No shared action descriptor. Same actions carry different icons across the two files. Adding Record means editing both, plus the More sheet for parity.

**Tests that will break.** `tests/v2-quickadd.test.ts:67` asserts the layout line `<V2QuickAdd currentUser={user} reedEnabled={reedEnabled} />` verbatim; adding a prop requires updating that regex. `tests/v2-quickadd.test.ts:49-63` and `tests/v2-mobile.test.ts:76-84` pin substrings that adding rows does not disturb.

## 3. Existing parse pattern (meetings)

**Flow.** `POST app/api/admin/meetings/[id]/transcript/route.ts` → `getOrgContext()` (401) → `getSupabaseAdmin()` (`:28`) → loads `meeting_records`, `calendar_events.attendees`, email-matches attendees via `matchAttendees` (`lib/meetings/match.ts:52`) → `parseTranscript()` (`lib/meetings/reed.ts:26`) → writes `meeting_records.summary` (transcript only if `store_transcript`) → deletes prior pending and inserts `meeting_suggested_tasks` rows with `status: "pending"` (`:83-100`). Accept: `POST .../suggestions/route.ts` → `getSupabaseAdmin()` (`:21`) → inserts `ops_tasks` (`:74-83`) with `org_id, title, category, created_by, meeting_record_id, linked_entity_type, linked_entity_id, linked_label`. It sets no `assigned_to`, `due_date`, `labels`, `origin_path`, or `description`.

**The Claude call. CORRECTED: it does not use the gateway.** `lib/meetings/reed.ts:32` is a raw `fetch("https://api.anthropic.com/v1/messages")` with `x-api-key`, `model: "claude-sonnet-4-6"` (`:18`), `max_tokens: 1200`, a single user message from `buildTranscriptPrompt`, and `JSON.parse` after stripping code fences (`:49-71`). No system prompt, no tool_use, no ledger row, no cap check. Six `ai_calls` rows exist in the last 90 days and all are `surface = 'reed'`; the meetings parser has never been logged.

**Service-role usage. CONFIRMED and CORRECTED (root cause).** Every DB call in both routes runs on `getSupabaseAdmin()` with hand `.eq("org_id", ctx.orgId)` fences. The reason: `meeting_suggested_tasks` has a single SELECT policy (`supabase/migrations/create_meeting_suggested_tasks.sql:26-43`; live `pg_policies` shows only `members read meeting_suggested_tasks`). No insert/update/delete policy exists, so a session client cannot stage or accept. `ops_tasks` does have session-writable RLS (`members write ops_tasks`, `ops.write`), so a Capture applier can insert tasks through the session client.

**Reuse as-is (pure or client-agnostic):**

- Prompt-builder pattern: `lib/meetings/transcript-prompt.ts` (pure, exported char caps, embeds `TASK_CATEGORIES`, tested in `tests/transcript-prompt.test.ts`).
- Coercion pattern: `coerceCategory` (`reed.ts:20-24`) and `isTaskCategory` / `isTaskPriority` (`app/admin/ops/_types/ops.ts:160-170`).
- `lib/meetings/match.ts` helpers take `sb: SupabaseClient` as a parameter; pass `createServerSupabase()` and they run under RLS. `MatchedEntity` type (`lib/meetings/types.ts:35`).
- `constituentName()` (`lib/fundraising/display.ts:7`), `sanitizeOriginPath()` (`lib/admin/originPath.ts:10`), `getAdminUser()` for the handle written to `created_by` / `assigned_to` (`lib/admin/auth.ts:158`), `resolveUserHandle()` (`lib/admin/ops/identity.ts:33`).
- The `ops_tasks` insert field shape at `suggestions/route.ts:74-83` (copy the shape, not the client).

**Do not copy:**

- `parseTranscript` (raw fetch). Use `generateStructured` (section 4).
- `getSupabaseAdmin()` plus hand fences in both routes.
- `lib/admin/ops/ingest.ts` `ingestTask` (hardcodes `assigned_to: "shannon"` and `getResidentOrgId()`).
- `meeting_suggested_tasks` as a staging table (SELECT-only RLS, `meeting_record_id NOT NULL`, columns do not fit four card kinds).
- `lib/fundraising/constituent-resolve.ts` `resolveConstituent` for matching: it creates a constituent on miss (`:71-83`).

**How `match.ts` matches. CONFIRMED: email only.** `externalEmails` (`:38-45`) collects non-org-domain attendee emails; `matchAttendees` (`:52-115`) uses `.overlaps("emails", ...)` on constituents and `partner_contacts.email` / `partners.champion_email` / `partners.domain` on partners. Names are used for prompt context only.

## 4. Gateway structured calls

File `lib/ai/gateway.ts`. Two exports: `generateText` (`:93`) and `generateStructured` (`:168`).

**Structured output. CONFIRMED: supported, via forced tool_use.**

```ts
// lib/ai/gateway.ts:143-158, 168-182 (shape)
export type GenerateStructuredOptions = {
  system: string;            // required; sent with cache_control ephemeral
  prompt: string;            // single user string, no messages[]
  tier?: "fast" | "deep";    // fast = claude-sonnet-4-6, deep = claude-opus-4-8 (MODEL_BY_TIER, :33-36)
  model?: string;
  maxTokens: number;
  tool: { name: string; description: string; input_schema: unknown };
};
// internally: tools: [tool], tool_choice: { type: "tool", name: tool.name }
export type GenerateStructuredResult = { input: unknown; model: string; usage: AIUsage; costUsd: number };
```

The gateway returns the tool input unvalidated; callers coerce with a pure parser (`parseNextMove` in `lib/agents/next-move/agent.ts`, `parseRecommendations` in `lib/agents/next-best-action/agent.ts`). CORRECTED versus the spec's wording: there is no `org_id`, `feature`, `user` or `json` option on the gateway, and `generateStructured` has no `voice` flag. The voice sweep (`cleanVoiceText`, `lib/ai/voice.ts:28`) runs only in `generateText` and only when `voice !== false` (`gateway.ts:128`). Structured callers sweep prose fields themselves.

**Ledger. CORRECTED: the caller writes it, not the gateway.** `logAICall(supabase, rec)` (`lib/ai/ledger.ts:43`, never throws) writes `org_id, surface, triggered_by, model_used, tokens_input, tokens_output, cost_usd, status, metadata` to `public.ai_calls`. Live RLS on `ai_calls`: `members read ai_calls` (SELECT, membership) and `members append ai_calls` (INSERT), so the session client can write it.

**Cap. CORRECTED: it is a deployment-wide env var, not a per-org setting.** `orgMonthlyCapUsd()` reads `ORG_MONTHLY_AI_CAP_USD`, default $100 (`lib/ai/cap.ts:20-26`). `orgOverAICap(supabase, orgId)` (`:31-35`) sums the org's `ai_calls.cost_usd` for the UTC month and returns `{ over, spentUsd, capUsd }`. It is checked by the caller, fail-open, and routes map `over` inconsistently: 429 in `app/api/admin/grants/coach/route.ts:63-69` and `app/api/reed/ask/route.ts:75-81`, 402 in `fundraising/next-move/route.ts:406-412` and `next-best-action/route.ts:203-208`. Capture should use 429 (Reed's convention) so 402 stays the entitlement signal.

**Exact call shape for Capture** (composed from `app/api/admin/grants/coach/route.ts:55-116` and `lib/agents/next-move/agent.ts:153-176`):

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { requireEntitlement } from "@/lib/admin/entitlements";
import { getAdminUser } from "@/lib/admin/auth";
import { generateStructured, AIKeyMissingError } from "@/lib/ai/gateway";
import { orgOverAICap } from "@/lib/ai/cap";
import { logAICall } from "@/lib/ai/ledger";

const ent = await requireEntitlement("ai.capture");           // 401 | 402
if (!ent.ok) return NextResponse.json({ error: ent.error }, { status: ent.status });
const supabase = createServerSupabase();                      // RLS; never getSupabaseAdmin

const cap = await orgOverAICap(supabase, ent.ctx.orgId);
if (cap.over) return NextResponse.json({ error: "...", capped: true }, { status: 429 });

let result;
try {
  result = await generateStructured({
    system: buildCaptureSystem(...),                          // lib/capture/prompt.ts, pure
    prompt: buildCapturePrompt({ transcript, today, tz, user, staff, context, candidates }),
    tier: "fast",                                             // claude-sonnet-4-6
    maxTokens: 1500,
    tool: { name: "submit_capture_cards", description: "...", input_schema: CAPTURE_SCHEMA },
  });
} catch (e) {
  if (e instanceof AIKeyMissingError) return NextResponse.json({ error: "..." }, { status: 503 });
  return NextResponse.json({ error: "Capture parsing failed" }, { status: 502 });
}
const cards = parseCaptureCards(result.input);               // pure validator; cleanVoiceText on prose only
await logAICall(supabase, {
  orgId: ent.ctx.orgId, surface: "capture", model: result.model,
  tokensInput: result.usage.inputTokens, tokensOutput: result.usage.outputTokens,
  costUsd: result.costUsd, triggeredBy: (await getAdminUser()) ?? ent.ctx.email,
  status: cards.length ? "success" : "partial", metadata: { capture_id, card_count: cards.length },
});
```

Models priced in `lib/ai/cost.ts:25-29`: `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-opus-4-8`. Session client is `createServerSupabase()` from `lib/supabase/server.ts:13` (no other session-client export exists). Org context is `getOrgContext()` (`lib/admin/auth.ts:97`) returning `{ userId, email, orgId, orgName, role }`.

## 5. Name matching feasibility (live AA data)

AA org `17c75da8-082d-4c8f-b00b-a4100fb2eb22`. Counts are non-archived rows unless stated.

**5a. First-name collisions.**

| Metric | Value |
|---|---|
| Constituents (non-archived) | 3,583 (4 archived) |
| Persons / organizations | 2,551 / 1,032 |
| Persons with a first name | 1,794 |
| Persons with no first or last name at all | 756 (all `source = hubspot_import`, all have an email) |
| Distinct first names | 1,014 |
| First names shared by 2 or more people | 279 names, covering 1,062 people |
| Exact duplicate full names (excluding blanks) | 32 groups, 65 rows |
| People sharing a last name with at least one other | 521 |

Top 15 first names: john 23, david 14, jeff 13, michael 13, jennifer 12, kevin 12, chris 11, jessica 11, greg 10, julie 10, sarah 10, stephanie 10, lisa 9, mark 9, mike 9.

Two things the spec should absorb. First, the name-matchable universe is about 2,826 rows (1,794 named persons plus 1,032 orgs), not 3,586; the 756 nameless rows are email-only and can never be matched by voice. Second, the realistic "two Marias" hazard is duplicates and families, not common first names: the Sobomehin surname alone has 10 rows (Dele, Kelsey, Kendra x2, Lisa, Niyi, Olaniyi, Rem, Remi, Tunde), and the two `Kendra Sobomehin` rows have different emails and 382 vs 5 interactions. `docs/constituent-dedupe-report.md` already covers merge mechanics.

**5b. Organization vs person storage. CONFIRMED.** `type` is `person` or `organization` (no `student` type). All 1,032 organizations store the name in `org_name` and have empty `first_name` / `last_name`. No person row has `org_name` set. A person's employer is not on the constituent row, so "Maria Chen from the Koshland Foundation" cannot be disambiguated by org from constituents alone; the org name must be matched separately, or via `partners` / `fr_prospects.org_name`. Trigram-close org names are dense: 1,490 pairs of AA organizations at similarity 0.6 or above.

**5c. pg_trgm. CONFIRMED installed (1.6, schema `extensions`, on the default search_path).** Trigram GIN indexes exist on `constituents.first_name`, `constituents.last_name`, `constituents.org_name`, plus `fr_prospects.name / org_name`, `interactions.notes`, `ops_tasks.description` (all from `supabase/migrations/bloomos_global_search_phase3.sql:13-20`). **No trigram index on `partners.name`** (145 AA partner rows, so a sequential `similarity()` is cheap; add one in C1 anyway for tenants). Default `show_limit()` is 0.3.

A name-search RPC already exists: `public.bloomos_search_people(q text, org uuid, lim int)` (`supabase/migrations/search_people_org_scope.sql:19-60`), security invoker, org-pinned, `archived_at is null`, scoring `greatest(similarity(first), similarity(last), similarity(org_name), similarity(first || ' ' || last))` over constituents UNION `fr_prospects`. It does not cover partners and does not touch students. The global search route calls it (`app/api/admin/search/route.ts:291`).

**5d. Matcher baseline.** Ten persons AA emailed in the last 30 days (Gmail-sourced interactions), chosen to include common first names and the Sobomehin collisions, scored with `similarity()` against all 3,583 AA constituents. Rank is the position of the correct row; ties are rows at similarity 0.99 or above.

| Target | Rank, first name only | Exact first-name ties | Rank, "first last" | Exact full-name ties | Runner-up full-name similarity |
|---|---|---|---|---|---|
| Susan Bird | 1 | 8 | 1 | 1 | 0.400 |
| Linda Prieto | 1 | 5 | 1 | 1 | 0.300 |
| Seth Linden | 1 | 4 | 1 | 1 | 0.278 |
| Jasmine Estela | 1 | 4 | 1 | 1 | 0.381 |
| Kendra Sobomehin | 1 | 3 | 1 | **2** | 0.850 |
| Frank Delgado | 1 | 2 | 1 | 1 | 0.286 |
| Mindy Rogers | 1 | 2 | 1 | 1 | 0.350 |
| Aris Payan | 1 | 1 | 1 | 1 | 0.211 |
| Tanise Love | 1 | 1 | 1 | 1 | 0.278 |
| Dele Sobomehin | 1 | 1 | 1 | 1 | 0.526 |

Reading: with a full name, trigram similarity puts the right row first in 10 of 10, and the runner-up is at least 0.3 below in 8 of 10. The spec's near-tie rule (two candidates within 0.1) would hold exactly two cards: Kendra Sobomehin (true duplicate, should hold) and nothing else. With a first name alone, 8 of 10 are exact ties with 1 to 7 other people, so the "Which Susan?" card is the normal case, not the exception; the context-entity prior and the org name in the sentence are what will resolve those. Dele Sobomehin's runner-up at 0.526 is a sibling, which is why the threshold constant should be tested against surname-heavy families, not just the 0.75 default.

Baseline caveat: these are spelled names from the database, not speech-to-text output. Web Speech will mangle uncommon names (Tanise, Olaniyi, Payan). The 20-note test set should be recorded, not typed.

## 6. Destination tables (live, via `pg_attribute` / `pg_attrdef` / `pg_constraint` / `pg_policies`)

**`org_id` defaults. CONFIRMED: none** on `interactions`, `partner_interactions`, `ops_tasks`, `reed_drafts`, `partners`, or `constituents`. CI enforces this for new tables via `supabase/tests/tenant-default-ratchet.sql`.

**RLS permission domains. CONFIRMED as the spec states:**

| Table | Read policy | Write policy |
|---|---|---|
| `interactions`, `constituents` | `fundraising.read` | `fundraising.write` (FOR ALL) |
| `partner_interactions`, `partners`, `partner_contacts` | `program.read` | `program.write` |
| `ops_tasks` | `ops.read` | `ops.write` |
| `reed_drafts` | membership (`exists memberships`) | same, FOR ALL |
| `ai_calls` | membership | INSERT only |

Role grants (`role_permissions`): `owner` and `admin` hold every permission; `staff` holds `fundraising.write`, `program.write`, `ops.write`; `finance` and `board_viewer` hold none of the three. AA has 5 members: 2 owners and 3 board viewers. So the assignee list for AA is the two owners, and board viewers get 403-equivalent RLS denials on every destination.

**`interactions`** (17 columns): `org_id uuid NOT NULL`, `constituent_id uuid NOT NULL` (FK, cascade), `kind text NOT NULL check in (call, email, meeting, event, note)` (CONFIRMED), `occurred_at timestamptz default now()`, `notes text`, `logged_by text`, `external_source text`, `external_id text`, `direction check (inbound, outbound)`, `subject`, `thread_id`, `body_preview`, `is_private boolean default false`, `matched_email`, `shannon_present boolean`. Unique index `interactions_external_idx (external_source, external_id, constituent_id)`. **`external_source = 'capture'`, `external_id = <card uuid>` fits** and gives idempotent upsert via `onConflict: "external_source,external_id,constituent_id"`, the same shape `lib/fundraising/gmail-sync.ts:165-184` uses. Existing `external_source` values: `hubspot`, `gmail`, `meeting`, `meet`, null. There is no user-uuid column; `logged_by` is a text handle (`'gmail'` for sync rows). Note the manual route `POST /api/admin/interactions` also calls `pushInteractionToHubSpot` (`lib/hubspot/sync-out.ts:152`, service role, no-op when HubSpot write is disabled); the spec should decide whether capture-filed interactions mirror to HubSpot.

**`partner_interactions`** (11 columns): `org_id`, `partner_id NOT NULL` (FK, cascade), `contact_id` (FK `partner_contacts`), `kind default 'note'` with the same five-value check, `occurred_at`, `notes`, `logged_by`, `external_source`, `external_id`. Unique index `(org_id, external_source, external_id, partner_id)`. **Fits the same provenance.** AA has 0 rows in this table, ever. The existing route (`app/api/admin/partners/interactions/route.ts`) also bumps `partners.last_touch_at`; the applier should too.

**`ops_tasks`**: `origin_path text` exists (CONFIRMED; added in `spec_a_platform_contracts.sql:80`; its only writer today is the in-app reporter, 1 AA row, sanitized by `sanitizeOriginPath` to a `/admin...` path of 200 chars or less). `labels text[] NOT NULL default '{}'` (CONFIRMED; labels in use include `cowork`, `report`, `bug`, `idea`, `grant`, `sys:ref:*`). Fields a task card must supply: `title NOT NULL`, `category NOT NULL check in (fundraising, program, product, finance, operations, compliance, board, other)`, `created_by text NOT NULL` (first-name handle from `getAdminUser()`; live values `remi`, `shannon`), `priority default 'medium'`, `status default 'todo'`. Assignee is split across `assigned_to text` (handle) and `assigned_to_id uuid` (FK `profiles.user_id`); the obligations view reads `assigned_to_id` as `owner_id`, so set both. `linked_entity_type` check includes `constituent` and `partner` (and `student`, which Capture must never emit). `due_date date`. `obligation_source text` is null on every row today.

**`reed_drafts`. CORRECTED.** `kind text NOT NULL check in (grant_narrative, board_update, acknowledgment, strategy_review, report_narrative)` (built up across `create_reed_drafts.sql:21`, `add_strategy_review_draft_kind.sql:7`, `spec_fin_report_artifacts.sql:22`). **No message kind exists.** `context_ref jsonb` is nullable and can carry `{ capture_card_id }` (CONFIRMED). `status check in (drafted, approved, discarded)`, `created_by text`, `model_used text`, `body text NOT NULL`, `title text`. AA has 0 rows. RLS is membership-only (CONFIRMED weaker than the `has_permission` floor; the spec already flags it for the security backlog).

**`v_obligations` grants (drift).** The migration grants `select` to `authenticated` only (`spec_fr_next_step_obligations.sql:244`); live `information_schema.role_table_grants` shows `anon`, `authenticated`, `postgres`, `service_role` each holding ALL privileges on the view. Under `security_invoker` the base-table RLS still gates rows, and `anon` passes no `has_permission` check, so this is not a leak, but it belongs in `docs/schema-drift-audit.md`.

## 7. Obligations view

**Definition.** `public.v_obligations`, created in `supabase/migrations/spec_a_v_obligations.sql:46` (9 arms) and last redefined in `spec_fr_next_step_obligations.sql:33-244` (10 arms). Live `pg_class.reloptions = {security_invoker=on}` (CONFIRMED). Apply order comes from the hand-maintained `ordered=(...)` array in `scripts/test-rls.sh` (line 228 for the F5 file), not filenames.

Sixteen columns, in order: `id text ('type:uuid')`, `org_id`, `type`, `title`, `why_it_matters`, `owner_id uuid`, `due_date date`, `state ('open' | 'in_progress' | 'blocked')`, `related_entity_type`, `related_entity_id`, `source`, `created_by text` (a handle, not a uuid), `resolved_at` (always null), `snoozed_until`, `module`, `contains_participant_data boolean` (explicit literal per arm; `rls-leak-test.sql:1388-1424` asserts the invoker option and that no row has a null flag).

Arms today: `ops_task`, `grant_requirement`, `compliance_item`, `acknowledgment`, `reconciliation_item`, `document_renewal`, `metric_stale`, `application_pending` (flag true), `session_unrecorded` (flag true, "conservatively" because its title embeds free text), `fr_next_step`.

**App side.** `lib/admin/today.ts:66-71` reads it on the session client selecting `id, type, title, why_it_matters, due_date, state, module`, `.eq("org_id", ctx.orgId)`, limit 500; `rankObligations` (`lib/admin/todayRank.ts:55-69`) buckets by due date then `SOURCE_WEIGHT[type] ?? 6`; deep links are type-level via `SOURCE_FALLBACK_HREF` (`lib/admin/actionQueue.ts:91-105`, a `Record` keyed on the `ActionItemRow["source"]` union, so a new type is a compile error until added). Resolve and snooze go through `app/api/admin/obligations/route.ts:14-19` (hardcoded `SOURCES` allowlist) to the `resolve_obligation` / `snooze_obligation` RPCs, which branch per source and raise "not resolvable" for unknown ones.

**Adding a `capture_cards` arm requires:**

1. A new migration that re-creates the view with 11 arms, emitting all 16 columns in position. Suggested: `'capture_card:' || c.id`, `c.org_id`, `'capture_card'`, a title like `'3 cards waiting from your 2:14 PM recording'` (needs a per-capture aggregate; one row per `captures` row with pending cards, as the spec wants), `null::uuid` or `c.created_by` as owner, `null::date` due (lands in the undated bucket, so give it a `SOURCE_WEIGHT`), `'open'`, `null` related entity, `'human'` source, `created_by::text`, `'ops'` module, and an explicit participant flag.
2. `where c.created_by = auth.uid()` in the arm. Under `security_invoker` this evaluates as the caller (CONFIRMED workable). It is belt-and-braces; the security boundary is RLS on `capture_cards` itself.
3. A `capture_card` branch in `resolve_obligation` (and `snooze_obligation` if snoozable), or resolving from Today raises.
4. App edits: `ActionItemRow["source"]` union and `SOURCE_FALLBACK_HREF` (`actionQueue.ts`), `SOURCE_WEIGHT` and `whyFallback` (`todayRank.ts`), `SNOOZABLE` / `RESOLVABLE` (`today.ts:43-44`), `SOURCES` allowlist (`obligations/route.ts:14`), `SOURCE_LABEL` (`NeedsYouQueueClient.tsx:51`).
5. Tests: `tests/obligations-view.test.ts` and `tests/fr-obligations.test.ts` pin the two existing files and need no change if the new arm ships as a new file; add a sibling test pinning the new file (11 arms, invoker on, flag literal present). Register the file in `scripts/test-rls.sh`'s ordered array or the runner fails. Add a leak-test block modeled on `rls-leak-test.sql:1381-1424`.
6. **Decision needed: `contains_participant_data`.** Card titles are transcribed free text and a user may say a student's name even though no card can file to one. The `session_unrecorded` precedent flags free-text titles `true`. Recommend `true` for the capture arm; the only cost is that Reed's queue tool (`lib/agents/reed/tools.ts:352`) will not see pending captures, which is fine.

## 8. Entitlements

**Live `org_entitlements` rows for `ai.*` keys** (table columns: `org_id, feature_key, enabled default false, source, updated_at`; PK `(org_id, feature_key)`):

| Org | `ai.reed` | `ai.prospect_research` | Any other `ai.*` |
|---|---|---|---|
| Ambition Angels | on (`seed:bloom_flourish`) | on (`seed:fence`) | none |
| Young, Gifted & Black | on (`seed:ygb_demo`) | on (`seed:ygb_demo`) | none |
| Young Life EPA | none | none | none |
| SafeSpace | none | none | none |

So "SafeSpace and Young Life EPA see no Record affordance" (spec DoD) follows from seeding `ai.capture` for AA and YGB only. No `ai.capture` row exists anywhere.

**Registration. CONFIRMED.** Keys are a `const` tuple `FEATURE_KEYS` in `lib/admin/entitlements.ts:27-68` with `type FeatureKey = (typeof FEATURE_KEYS)[number]`; `ai.*` today is `ai.reed` and `ai.prospect_research`. Adding `"ai.capture"` is one line and a typo is a compile error. **Unknown keys default OFF. CONFIRMED by construction:** `getEntitlements(orgId)` (`:85-93`) selects `feature_key where enabled = true` on the session client into a `Set`, and `hasFeature` is `ents.has(key)` (`:96-98`); `tests/entitlements.test.ts` asserts every key is off against an empty set. `requireEntitlement(key)` (`:126-133`) returns `{ ok: false, status: 401 }` with no session and `{ ok: false, status: 402 }` when the org lacks the key (CONFIRMED 402). Client surfaces learn entitlements as server-computed booleans passed as props (no provider or context exists); the same for `ai.capture`.

Seed pattern to copy (`seed_aa_ai_prospect_research.sql:15-20`): `insert ... select o.id, 'ai.capture', true, 'seed:capture' from orgs o where o.slug in ('ambition-angels', 'young-gifted-black') on conflict (org_id, feature_key) do update set enabled = true, ...`. Apply the seed before deploying a gated route or AA locks itself out (that file's own header note).

## 9. Students fence

**Student and participant tables (live):** `students` (27 AA rows, 70 total; columns include `first_name, last_name, email, phone, partner_id, stage, custom_fields, constituent_id`), `applications`, `cohorts`, `cohort_members`, `cohort_sessions`, `attendance`, `participant_stages`, `journey_enrollments` (donor journeys, not youth), `ygb_attendance`, `ms_sessions` (auto handles only, by rule), `imports` (staging rows can hold student names). RLS on `students`, `applications`, `cohort_members`, `attendance`, `participant_stages` is `program.read` / `program.write`, the **same** permission as `partners` and `partner_interactions`. RLS therefore does not separate students from partners for anyone who can log a partner interaction; the fence has to be in the code's choice of tables.

**Cross-link.** `students.constituent_id` FK to `constituents` exists (`create_students.sql:21`, `ON DELETE SET NULL`). Live: **0 rows populated, in any org.** Constituents has no `student` type (check is `person | organization`), and 0 AA constituents carry a student-ish tag or custom field. So a constituents-plus-partners matcher reaches no student today. The spec should still state the rule as a contract ("constituents is the fundraising party table; the matcher never joins students") and add a CI test, because the FK makes a future mirror possible.

**Helpers and whether they reach students:**

| Helper | Tables | Safe for the matcher? |
|---|---|---|
| `bloomos_search_people(q, org, lim)` RPC | `constituents` + `fr_prospects` | Yes (filter `kind = 'constituent'`, or accept prospects as candidates). Does not cover partners. |
| `app/api/admin/meetings/[id]/connect/route.ts:25-32` | `constituents` ilike + `partners.name` ilike | Yes; closest "constituents and partners by name" precedent. Add `.eq("org_id")` and `.is("archived_at", null)`. |
| `app/api/admin/constituents/search/route.ts` | `constituents` + `hs_contacts` | Yes for a confirm-screen typeahead. |
| `lib/fundraising/constituent-resolve.ts` `resolveConstituent` | `constituents` | **No**: creates a row on miss, ignores `archived_at`, no org pin. |
| `app/api/admin/search/route.ts` (global ⌘K) | 10 tables including **`students`** (`:236-249`) | **No.** |
| `lib/admin/entities.ts` `resolveEntities` | by id, registry includes `student` | Only with `type: 'constituent' | 'partner'`. |
| `lib/meetings/match.ts` | `constituents`, `partner_contacts`, `partners` | Yes (email only). |

No unified search index or view exists (CORRECTED versus a possible assumption): the "unified" surface is route-layer fan-out in the global search route.

**Recommended guard:** a vitest text test on `lib/capture/**` asserting no `from("students")`, `from("applications")`, `from("cohort_members")`, `from("attendance")`, `from("imports")`, and no `type: "student"` passed to `resolveEntities`, in the style of `tests/work-meetings.test.ts:47-53`.

## 10. Existing voice capture and interaction logging

**Voice or audio. CONFIRMED: one surface.** `useSpeechRecognition` in ReportModal is the only speech code. `MediaRecorder` and `getUserMedia` appear nowhere in `app/`, `lib/`, `components/`, or `tests/`.

**Interaction logging the spec's "Current behavior" section misses:**

| Surface | Writes | Route and client | Volume |
|---|---|---|---|
| Donor profile "+ Log" form (`ConstituentControls.tsx:226-301`, kind select, date, notes; default kind `call`) | `interactions` | `POST /api/admin/interactions`, **session client**, strict kind validation, notes capped at 4000, audit row, HubSpot mirror | 1 AA row ever (2026-06-18); 17 YGB demo rows |
| Partner profile "+ Log touch" (`PartnerProfileControls.tsx:249-315`, default kind `meeting`) | `partner_interactions` + `partners.last_touch_at` | `POST /api/admin/partners/interactions`, **service role** with org fence, kind defaults to `note` on bad input | 0 AA rows ever |
| Partners board "Log touch" (`PartnersWorkspace.tsx:404-410`) | only `partners.last_touch_at` | `PATCH /api/admin/partners/manage/[id]` | no interaction row |
| Meet booking (`app/api/admin/meet/connections/[id]/book/route.ts:80-96`) | `interactions` kind `meeting`, `external_source = 'meet'` | service role | 0 rows ever |
| Calendar meeting matcher (`lib/meetings/match.ts`) | `interactions` kind `meeting`, `external_source = 'meeting'` | service role | 18 AA rows, 2026-06-26 to 07-06 |
| Meetings transcript → suggested tasks → accept (section 3) | `meeting_suggested_tasks` → `ops_tasks` | service role | 4 tasks carry `meeting_record_id` |

Reed has no interaction-writing tool: all 19 tools in `lib/agents/reed/tools.ts` are reads or `propose_*` / `save_draft`. Prospect profiles have no log affordance.

**The spec's data claim. CONFIRMED and sharpened.** In the last 60 days AA logged 535 interactions, all `gmail` / `email`. All-time AA by source: `hubspot` 54,141 (imported 2026-06-12 to 06-17, including 3,463 meetings and 2,659 notes that staff once logged in HubSpot), `gmail` 1,779, `meeting` 18, manual 1. `docs/interaction-capture-diagnostic.md` (2026-09-03) documents that HubSpot engagement volume was already collapsing before the mirror froze, and that every scheduled job was returning 401 at the time. The manual Log form exists and nobody uses it, which is the spec's thesis in one row.

---

## Changes to the spec

1. **Matcher: build on what exists.** Replace "the existing matcher matches email addresses only" with: email matching lives in `lib/meetings/match.ts`; trigram name search exists as `bloomos_search_people` plus GIN indexes on constituents. `lib/capture/match.ts` should be a session-client query (or a new invoker RPC with `set check_function_bodies = off` so the CI stub DB accepts it) over constituents and partners, modeled on the connect route, never on `resolveConstituent`. Add `partners_name_trgm` in C1.
2. **Matcher: size the universe honestly.** Name-matchable AA rows are about 2,826 (1,794 named persons, 1,032 orgs); 756 person rows have no name and are unreachable by voice. The near-tie hold should be tuned on surnames and duplicates (Sobomehin x10, 32 exact-duplicate pairs), not on common first names, which the baseline shows resolve cleanly once a last name is present. Record the 20-note test set with real speech, not typed names.
3. **Matcher: the "from the Koshland Foundation" clause has nowhere to land on a person row.** Person constituents carry no org affiliation. Treat an org name in the sentence as a second candidate span matched against `constituents.org_name`, `partners.name`, and `fr_prospects.org_name`, and let the model link person and org cards. Decide whether `fr_prospects` (396 live AA rows) is a legitimate interaction destination or only a disambiguation hint; today interactions require a constituent.
4. **C1 must add a `reed_drafts` kind.** The Message draft destination fails the live check constraint. Add `'message'` (or `'capture_message'`) to the kind check in the C1 migration, idempotently, following `add_strategy_review_draft_kind.sql`.
5. **C1 RLS must include insert and update policies** on `captures` and `capture_cards`, not just select. The meetings precedent went service-role precisely because its staging table is SELECT-only. Policy shape: `has_permission(org_id, 'ops.read') and created_by = auth.uid()` for select; `has_permission(org_id, 'ops.write') and created_by = auth.uid()` with check for insert/update. `created_by` should be `uuid` (= `auth.uid()`), unlike `ops_tasks.created_by`, which is a text handle; the obligations arm casts.
6. **Cap and ledger wording.** The cap is `ORG_MONTHLY_AI_CAP_USD`, one number for the deployment applied to each org's month-to-date spend, checked by the route; the ledger row is written by the route via `logAICall`. Use 429 for cap-exceeded so 402 stays the entitlement signal. Keep the per-user rate limit (30/hour) as a separate, new check; nothing like it exists.
7. **Gateway wording.** Use `generateStructured` (forced tool_use). It has no voice flag; apply `cleanVoiceText` in the validator to prose fields only (interaction notes, draft body), never to names, dates, or handles.
8. **Task cards need a category.** `ops_tasks.category` is NOT NULL and check-constrained; the prompt should pick from `TASK_CATEGORIES` with `other` as the fallback. Set both `assigned_to` (handle) and `assigned_to_id` (uuid). Assignee candidates are org members holding `ops.write` (AA: the two owners).
9. **Provenance on `interactions`: decide the HubSpot mirror.** The manual route mirrors each logged interaction to HubSpot when write is enabled. State whether capture-filed interactions do the same (recommend yes, same code path, so the record does not fork).
10. **Obligations arm: flag participant data `true`** (conservative, free-text title precedent) and list the six app-side edit points in C5. One obligation per capture with pending cards means the arm aggregates `capture_cards` by `capture_id`.
11. **Entitlement: seed before gate.** `ai.capture` for `ambition-angels` and `young-gifted-black` in the C1 migration, applied before the C2 route deploys.
12. **Apply path and the ledger check.** The runbook says Remi applies SQL in the dashboard SQL editor, but `.github/workflows/migration-ledger.yml` fails any PR whose migration file has no row in `supabase_migrations.schema_migrations`, and the SQL editor does not write that ledger (`docs/schema-drift-audit.md:486-490`). UNKNOWN which path Remi uses today to satisfy it; the spec's "hand Remi SQL" line should name the path (MCP `apply_migration` with the filename as `name` provably writes the ledger).
13. **Transcript retention depends on cron.** The 90-day purge needs a working cron; `docs/interaction-capture-diagnostic.md` found every scheduled job returning 401 on 2026-09-03, and `docs/cron-restoration-plan.md` exists. UNKNOWN whether that is fixed. Either confirm cron health before C1 or ship retention as a manual "purge" action plus a cron later.
14. **Speech: scope the hook work explicitly in C4.** Auto-restart, accumulated transcript, interim flush and display, visible errors, timer and cap, single-recognizer. That is a rewrite of the hook, not a reuse; ReportModal keeps working if the new behavior is opt-in.
15. **Current behavior section.** Mention the donor "+ Log" and partner "+ Log touch" forms and their usage (1 and 0 AA rows). It strengthens the case and tells C4 which routes already validate `kind` the way the applier must.
16. **Drift to log, not fix here.** `v_obligations` grants in production are wider than the migration (`anon` and `service_role` hold ALL); harmless under `security_invoker`, belongs in the drift audit.
