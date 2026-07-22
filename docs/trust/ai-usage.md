# AI Usage Report — BloomOS + Marketing Website

**Status:** Internal report (source of truth for marketing-site "how we use AI" copy and tier packaging).
**Date:** 2026-07-22
**Scope:** Every Anthropic Claude API call site in this codebase — the public marketing website and the BloomOS admin product — plus how the tier system (Bloom → **Bloom Grow** → Bloom Flourish) gates access today, and the gaps between what the code enforces and what the packaging implies.

---

## 1. Executive summary

- All AI in the product is **Anthropic Claude**, called server-side only. Two models are in use: `claude-sonnet-4-6` (fast/conversational tier) and `claude-opus-4-8` (deep/judgment tier; funder research still pins `claude-opus-4-7`). Model choice is centralized in `lib/ai/gateway.ts`, though several older agents still call the API directly.
- **AI never acts autonomously.** Every AI surface is either advisory prose (briefings, coaching feedback) or an inert proposal/draft that a human must accept before anything is saved, sent, or booked. Reed's tools are read-only; Reed cannot send email, move money, change permissions, or delete anything.
- **On the public site, AI touches no student PII in `/ms`** (the middle-school game): matching is fully deterministic, students have no free-text input, and the only two model calls see trait scores + career titles + anonymous handles. The career quiz does send quiz answers (including the teen's first name) to Claude; the trust docs note a **zero-data-retention agreement with Anthropic is still pending** and required before any student PII flows.
- **Tier model in code:** `ai.reed` is the entitlement that separates **Bloom** from **Bloom Grow**; `coaching` marks **Bloom Flourish** (human SOBO coaching; Reed offers to tee up sessions when the org holds it). `ai.prospect_research` gates the fundraising research agents — but **only in the UI**.
- **Key finding:** as enforced today, "Bloom Grow unlocks AI" is only true for **Reed Ask**. Every other AI surface in BloomOS (13 of 14) is available to any authenticated tenant with no entitlement check on the server. Section 5 lists what to reconcile before the marketing site makes tier claims.

---

## 2. The tier model (as it exists in code)

Defined in `lib/admin/entitlements.ts`. Entitlements are per-org rows in `org_entitlements`, read through the RLS session client; unknown keys are OFF.

| Tier | Entitlement key | What it unlocks |
|---|---|---|
| **Bloom** (base) | — | All module switches (`modules.*`) as seeded; every AI surface that has no entitlement gate (see §4) |
| **Bloom Grow** | `ai.reed` | **Reed, the AI assistant** — the Ask Reed FAB, `/admin/reed`, record-anchored panels, meeting-agenda drafting, strategy review. Server-enforced: `app/api/reed/ask` returns **402** without it. |
| **Bloom Grow** (intended) | `ai.prospect_research` | The fundraising prospect-research surfaces (funder research briefs, prospect discovery). Currently **UI-gated only** — see §5.2. |
| **Bloom Flourish** | `coaching` | Human SOBO coaching (the "judgment-heavy 20%"). Not an AI feature itself; when held, Reed's system prompt lets it offer to tee up a coaching session. |

The upsell boundary is explicit in code: `requireEntitlement()` returns **402 Payment Required** with "This feature requires an upgrade" when an org lacks the key.

> ⚠️ Naming note: `docs/bloomos/01-vision-and-strategy.md` (Ring-4 pricing) uses a *different* scheme — **Seed $0 / Bloom ~$99 / Grow ~$249**, where the priced "Grow" is described around advanced reporting/NDPA, not AI, and "Bloom" is described as including "AI features with monthly credit pool." The code's Bloom / Bloom Grow / Bloom Flourish names carry no pricing anywhere in the repo. These two schemes must be reconciled before public pricing/AI copy ships (§5.1).

---

## 3. AI on the public marketing website

Four surfaces call Claude. All are server-side; the API key never reaches the browser.

### 3.1 Career-match quiz — `app/api/career-match/route.ts`
- **What it does:** the public "what career fits you" quiz (modal on `/` and `/curriculum`) returns 10 personalized career matches as JSON.
- **Model:** `claude-sonnet-4-6` via the gateway (fast tier, 1,500 output tokens).
- **Data sent to Claude:** the full quiz answer set — age, life stage, location, interests, work style, personality scores, goals — **including the teen's first name**. Email is collected but deliberately excluded from the prompt.
- **Safeguards:** per-IP rate limit (10 requests / 10 min). Lead capture (`/api/quiz-submit`) is a separate, non-AI route.

### 3.2 `/ms` — "What Are You Built For" (middle-school career game)
AI is used in **exactly two places**, and never in the matching path (confirmed in code; matching is a deterministic RIASEC scorer in `lib/ms/`):
- **Results summary** (`lib/ms/summary.ts`, called by `app/api/ms/session`): a 3-sentence strengths-only note on the results page. **Input to Claude is only six trait sums and up to three career titles** — students have no free-text field anywhere, and no name/email exists to send (COPPA is "structural, not procedural"). Output is regex-filtered against deficit language and dropped to `null` on any failure, so results always render. Sonnet, 300 tokens, per-IP rate limit 20/10 min.
- **Facilitator prompts** (`app/api/ms/room/[code]/deliver`): one conversation-starter sentence per student in the host's group email. Input is the anonymous in-room **handle**, trait names, and career titles. Host-token gated; a model failure sends the email without prompts.
- Every other `/ms` route (reveal, deliver, room, assign) is AI-free.

### 3.3 `/shannon` decision tool — `app/api/shannon/route.ts`
A bespoke private family decision-analysis tool that happens to live on the public site (standalone chrome, not linked). Calls the Anthropic REST API **directly** (not the gateway), Sonnet, 4,000 tokens. Sends all 20 highly personal form answers plus a system prompt embedding sensitive family/financial details. **Has no rate limit.** Should be excluded from public "how we use AI" copy (it is not a product feature) but included in any internal inventory — and ideally rate-limited or retired (§5.4).

### 3.4 What the site currently says about AI
- `site-copy.md` mentions AI only thematically ("AI is restructuring the job market…"); **no public page currently explains that Claude powers the quiz or the /ms summaries**.
- `docs/trust/subprocessors.md` (draft) lists Anthropic: "Quiz answers as submitted (name/email excluded from prompts where feasible); public funder research data. No student records. **ZDR agreement pending — required before any student PII enters prompts.**"
- `docs/trust/trust-page-draft.md` (unpublished): "Student information is never used to train AI, and AI never makes decisions about a young person. People do." — this line is accurate against the code and is the anchor claim for the marketing site.

---

## 4. AI inside BloomOS (the admin product)

### Shared infrastructure
- **Gateway** (`lib/ai/gateway.ts`): single seam for text and structured calls; fast → `claude-sonnet-4-6`, deep → `claude-opus-4-8`; system-prompt caching; returns usage + estimated cost.
- **Price sheet** (`lib/ai/cost.ts`): Sonnet $3/$15 per M tokens, Opus $5/$25; unknown models fall back to Sonnet pricing. Tested.
- **Spend ledger** (`lib/ai/ledger.ts`): append-only `ai_calls` per-org ledger. Tested.
- **Org backstop** (`lib/ai/cap.ts`): global per-org monthly AI cap, default **$100** (`ORG_MONTHLY_AI_CAP_USD`), fail-open.

### 4.1 The Bloom Grow surface: Reed Ask
`app/api/reed/ask/route.ts` + `lib/agents/reed/{client,tools}.ts` — **the only server-gated AI surface** (`requireEntitlement("ai.reed")` → 402).

- Bounded read-only tool-use loop (max 6 turns) over the org's real data via 19 RLS-scoped tools: finance snapshot, fundraising forecast, grant deadlines, meeting briefs, constituent/partner dossiers, needs-you queue, status/outlook, metric catalog + explain, strategy plan/coherence, document list/read, plus three **inert-proposal** writes (`save_draft`, `propose_next_best_action`, `propose_plan_element`, `propose_document_extraction`).
- Cannot send email, move money, change permissions, or delete. All numbers come from tools, never authored by the model.
- Model: `claude-sonnet-4-6`. Per-org cap: **$25/month** hard stop (429), warn at $18, tracked in `reed_activity_log` and mirrored to the unified ledger.
- Entry points (all UI-gated on `ai.reed`): Ask Reed FAB, `/admin/reed`, record panels, meeting agenda button, strategy review button.

### 4.2 Everything else (currently ungated at the server — effectively base Bloom)

| # | Feature | Where | Model | Data sent | Guardrails |
|---|---|---|---|---|---|
| 1 | **Meeting transcript parser** — summary + suggested follow-up tasks (human accepts) | `lib/meetings/reed.ts`, transcript route | Sonnet | Meeting title, attendees, agenda, transcript (12k chars) | Auth only; no cap, no ledger |
| 2 | **Funder research briefs** — 9-section deep brief w/ web search, background job | `lib/agents/funder-research/*` | **Opus 4.7**, ≤20 web searches | Prospect's full HubSpot-mirror context | UI-gated `ai.prospect_research` only; rate limit 5/10min; **$20/mo shared fundraising wallet**; ledgered |
| 3 | **Prospect discovery** — web-searches 5–8 net-new candidates per strategy angle | `lib/agents/prospect-discovery/agent.ts` | Sonnet, ≤8 searches | Angle, target type, exclude list | Same wallet; rate limit 8/10min; ledgered |
| 4 | **Next-best-action** — ranks pipeline opportunities, proposes one action each | `lib/agents/next-best-action/agent.ts` | Sonnet (gateway) | Per-opportunity fundraising facts (≤25) | Same wallet; rate limit 10/10min; ledgered |
| 5 | **Next move + email draft** — single best move for one donor, ready-to-edit email | `lib/agents/next-move/agent.ts` | **Opus 4.8** (gateway) | Full donor dossier (private rows filtered; honors do-not-contact) | Same wallet; rate limit 15/10min; ledgered |
| 6 | **Grant Coach ("Reed's Proposal Review")** — critic-only stress test through 4 audience lenses; never writes the proposal | `lib/fundraising/grantCoach.ts` | **Opus 4.8** (gateway) | Proposal draft (text or PDF document block) + funder materials | Org backstop; ledgered |
| 7 | **Grant Coach "Defend the draft"** — turn-by-turn tough-reader interrogation | `.../coach/defend` route | Opus 4.8 (gateway) | Draft + chat history (stateless) | Org backstop; ledgered |
| 8 | **Strategy angle draft ("Draft with Reed")** — drafts a Strategy Room angle from a brief | strategy angles draft route | Sonnet (gateway) | Operator's brief (≤2k chars) | Ledgered; no cap |
| 9 | **Thank-you note draft** — short acknowledgment grounded in giving history; editable, never auto-sent | acknowledgments draft route | Sonnet (gateway) | Donor first name + gift stats | Rate limit 30/10min; **not ledgered/capped** |
| 10 | **Finance categorization** — suggests chart-of-accounts category + rule per bank transaction; advisory, apply-after-confirm | `lib/finance/ai-categorize.ts` | **Opus 4.8** (adaptive thinking) | Category list + ≤60 transaction descriptions/amounts | **Not ledgered/capped** |
| 11 | **Morning executive briefing** — daily headline/narrative; deterministic selection, AI narrates only (no invented numbers); deterministic fallback | `lib/admin/briefing/narrate.ts` + cron | Sonnet | Rounded fact sheet (runway, pipeline, counts) | Not ledgered/capped |
| 12 | **Weekly briefing (legacy)** — weekly headline/narrative/priorities | `lib/briefing.ts` + cron | Sonnet | SQL-computed weekly operating data | Not ledgered/capped |
| 13 | **Bug-report interview** — conversational intake (≤4 questions) → ready-to-paste dev prompt | report/debug route | Sonnet | The Q&A transcript, page context | Not ledgered/capped |

Non-calls worth knowing (they look AI-adjacent but make no model call): `RulesEditor.tsx` ("Anthropic" is a seed merchant string), `TaskEditModal.tsx` (renders an already-generated prompt), `app/api/admin/report` (files the task), `lib/demoday/attendees.ts` (attendee employer data).

---

## 5. Gaps to close before the marketing site makes AI/tier claims

1. **Reconcile the two tier vocabularies.** Code says Bloom / **Bloom Grow** (`ai.reed`) / Bloom Flourish (`coaching`); the vision doc prices Seed $0 / Bloom $99 / Grow $249 and puts "AI features with monthly credit pool" in *Bloom*, not Grow. The website cannot state "AI is a Bloom Grow feature" and "Bloom includes AI credits" at the same time. Decide the canonical mapping, then update whichever document loses.

2. **`ai.prospect_research` is presentational only.** The prospects UI and sidebar hide behind it, but the four fundraising-agent API routes (#2–#5 in §4.2) check only `isAuthed()`. A base-Bloom tenant that hits the endpoints directly gets the paid feature. If prospect research is meant to be a Bloom Grow capability, add `requireEntitlement("ai.prospect_research")` to those routes (the pattern already exists in `reed/ask`).

3. **Most AI surfaces are unmetered.** If the packaging story is "AI with monthly credit pool," note that today only Reed ($25), the fundraising wallet ($20 shared), and grant coach (via the $100 backstop) are bounded; briefings, transcript parsing, thank-you drafts, finance categorization, angle drafts, and the bug interviewer have no cap and several have no ledger rows. Routing them all through `logAICall` + the org backstop makes the credit-pool claim true.

4. **`/shannon` has no rate limit** and bypasses the gateway. It's a personal tool, not a product surface — either add the standard `rateLimit` guard or retire it; exclude it from public AI copy either way.

5. **ZDR before student PII.** The subprocessor doc's own condition — an Anthropic zero-data-retention agreement before student PII enters prompts — is still open, and the career quiz already sends a teen's first name. Either strip the name from the career-match prompt (the `/ms` product proves the no-PII pattern works) or close the ZDR agreement before the trust page ships.

## 6. Suggested public-facing claims (all true against the code today)

Safe to publish now:
- "AI (Anthropic Claude) helps power our career quiz and writes the short strengths summary in our middle-school game. Career matching in the middle-school game is **not** AI — it's a deterministic, published scoring method."
- "In the middle-school game, students never enter their name or email, and the AI only ever sees anonymous trait scores — never anything a child typed."
- "Student information is never used to train AI, and AI never makes decisions about a young person. People do." (already drafted in `docs/trust/trust-page-draft.md`)
- "In BloomOS, AI drafts and proposes — a person always reviews and approves before anything is saved or sent. The AI assistant's data access is read-only and scoped to your own organization."
- "Reed, the BloomOS AI assistant, is included in the Bloom Grow plan." *(true — it is the one server-enforced Bloom Grow feature)*

Hold until §5 items are resolved:
- Any claim that *all* AI features are Bloom Grow-gated, any AI "credit pool" language, and any per-tier price next to an AI feature list.
