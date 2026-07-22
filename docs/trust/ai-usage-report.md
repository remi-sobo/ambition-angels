# AI Usage Report — Ambition Angels website + BloomOS

Purpose: a complete, code-verified inventory of every place AI is used across the
public marketing website and BloomOS, and exactly which AI capabilities unlock at
the second plan level, **Bloom Grow**. Written as source material for the
marketing site's "how we use AI" disclosure. Every claim below is anchored to a
file in this repo as of 2026-07-22.

---

## 1. How the AI layer is built

- **One provider.** Every model call in the product goes to the Anthropic Claude
  API (`@anthropic-ai/sdk`, keyed by `ANTHROPIC_API_KEY`). There is no other LLM
  provider in the codebase. Anthropic is listed as a subprocessor in
  `docs/trust/subprocessors.md`.
- **One chokepoint for simple calls.** `lib/ai/gateway.ts` handles plain
  text-in/text-out and single-shot structured calls, and maps task tiers to
  models: `fast` → `claude-sonnet-4-6`, `deep` → `claude-opus-4-8`. The bespoke
  multi-turn agents (Reed, funder research, prospect discovery) call the SDK
  directly.
- **Spend is metered.** Every call is priced (`lib/ai/cost.ts`), written to a
  per-org spend ledger (`lib/ai/ledger.ts`), and backstopped by a global per-org
  monthly cap (`lib/ai/cap.ts`, default $100). Reed has its own per-org monthly
  cap ($25, `REED_MONTHLY_CAP_USD`), and the fundraising agents share a $20/mo
  agent wallet.
- **Graceful degradation.** The briefing, /ms summaries, and other surfaces fall
  back to deterministic output (or omit the AI section) when the key is missing
  or a call fails — AI is additive, never load-bearing for core data.

## 2. AI on the public marketing website

| Feature | What the AI does | Route / module | Model | Data sent to Claude |
|---|---|---|---|---|
| **Career-match quiz** | Turns quiz answers into 10 personalized career matches | `app/api/career-match/route.ts` | Sonnet 4.6 | Quiz answers: age, interests, trait scores, location, money-vs-meaning, dream-day text. Email is captured but **not** sent to the model. Rate-limited per IP. |
| **/ms "What Are You Built For" — strengths summary** | Writes an optional 3-sentence strengths note after the game | `lib/ms/summary.ts` via `app/api/ms/session/route.ts` | Sonnet 4.6 | Six trait numbers + up to 3 career titles only. **No child free-text, name, or email is ever sent** (structural COPPA rule). Fails silently to no summary. |
| **/ms group rooms — facilitator prompts** | One conversation-starter sentence per student for the teacher | `app/api/ms/room/[code]/deliver/route.ts` | Sonnet 4.6 | Auto-generated handles, strongest traits, cards explored, top matches. No free text. |
| **Shannon decision tool** | Personal one-off reflection tool at `/shannon` | `app/api/shannon/route.ts` | Sonnet 4.6 | 20 free-text reflection answers. Bespoke personal page, not a product surface. |

**What is deliberately NOT AI on the public site** (these are the strongest
disclosure points):

- **/ms career matching is fully deterministic.** The RIASEC ranking is a pure
  function over an approved catalog (`lib/ms/score.ts`) — "no model anywhere in
  this path" (design decision D3). The game has exactly two live model calls
  (D8): the strengths summary and the facilitator prompts.
- **/ms pay and education clues are rendered from BLS/O*NET government data,
  never generated** — "the model is never asked for a number, so it cannot
  hallucinate one" (`lib/ms/render.ts`).
- **Career cards are human-approved.** Cards are drafted by Claude Opus 4.8 in an
  admin batch tool (`/admin/careers`), machine-gated, and only reach students
  after a human clicks approve. Approval is "a human click, never code."

## 3. AI inside BloomOS (the admin product)

### Gated at Bloom Grow and above

| Feature | What it does | Route / module | Model |
|---|---|---|---|
| **Reed — the BloomOS assistant** | The "Ask Reed" FAB: answers questions over the org's real data through a read-only tool loop (metrics, finance, donor dossiers, meeting briefs, documents — all RLS-scoped). Drafts and proposes; never sends, submits, moves money, or deletes. Hard rule: Reed never authors a number — every figure must come from a tool result. | `app/api/reed/ask/route.ts`, `lib/agents/reed/*` | Sonnet 4.6 |

Reed is the only surface with server-side entitlement enforcement today:
`requireEntitlement("ai.reed")` returns 402 without it, the FAB doesn't mount,
and `/admin/reed` redirects.

### Gated as a separate paid add-on (`ai.prospect_research`)

| Feature | What it does | Route / module | Model |
|---|---|---|---|
| **Funder research briefs** | Deep 9-section prospect brief with live web search over a HubSpot-mirrored record | `lib/agents/funder-research/*` | Opus 4.7 |
| **Prospect discovery** | Web-searches net-new prospects for a strategy angle, excluding the existing bench | `lib/agents/prospect-discovery/agent.ts` | Sonnet 4.6 |

The Prospect Research module is fenced at the module layout
(`app/admin/fundraising/prospects/layout.tsx` FeatureGate), independent of the
Bloom/Grow/Flourish bundles.

### Available to any authenticated BloomOS tenant (no tier key today)

| Feature | What it does | Route / module | Model |
|---|---|---|---|
| **Morning briefing narrative** | Narrates a deterministic fact sheet (runway, cash, pipeline, follow-ups). The engine computes every number; the model may not introduce any. Deterministic fallback if AI is unavailable. | `lib/admin/briefing/narrate.ts` | Sonnet 4.6 |
| **Weekly executive briefing** | Headline + narrative + 3 priorities from computed weekly operating data | `lib/briefing.ts` | Sonnet 4.6 |
| **Next-best-action** | Ranks open opportunities, proposes one action each | `lib/agents/next-best-action/agent.ts` | Sonnet 4.6 |
| **Next move (per person)** | Best single action + ready-to-send email draft for one donor | `lib/agents/next-move/agent.ts` | Opus 4.8 |
| **Grant Coach + "defend the draft"** | Critiques a grant draft (text or PDF); interactive reviewer interrogation | `app/api/admin/grants/coach/*` | Opus 4.8 |
| **Acknowledgment drafts** | Personal gift thank-you note. The IRS/tax receipt block is **never AI-written** — appended server-side. | `app/api/admin/acknowledgments/draft/route.ts` | Sonnet 4.6 |
| **Strategy angle drafts** | Drafts a Strategy Room framing angle from an operator brief | `app/api/admin/strategy/angles/draft/route.ts` | Sonnet 4.6 |
| **Finance categorization suggestions** | Suggests a chart-of-accounts category per bank transaction. Advisory only — writes nothing. | `lib/finance/ai-categorize.ts` | Opus 4.8 |
| **Meeting transcript parsing** | Transcript → summary + 1–3 staged follow-up suggestions (never live tasks) | `lib/meetings/reed.ts` | Sonnet 4.6 |
| **Career-card generator** | Drafts /ms card content for human approval (see §2) | `lib/ms/generate.ts` | Opus 4.8 |
| **Bug-report prompt synthesizer** | Internal dev tooling: interviews the operator, emits a Claude Code prompt | `app/api/admin/report/debug/route.ts` | Sonnet 4.6 |

**Deliberately no-AI surfaces in BloomOS:** the Command Center "Needs you today"
feed ("no AI cost, nothing invented"), the Monday/Friday orient panels, and
strategic-plan setup ("Deterministic — no AI writes").

## 4. The plan tiers — what Bloom Grow actually unlocks

Source: `lib/admin/entitlements.ts` and
`supabase/migrations/create_org_entitlements.sql`. Entitlements are per-org data
rows; the plan → entitlement mapping is billing's job later, but the intended
bundles are documented in code:

| Plan | AI entitlements granted | What that means |
|---|---|---|
| **Bloom** (base) | none | No Reed. `/api/reed/*` returns 402; the FAB never mounts. |
| **Bloom Grow** | `ai.reed` | **Reed, the AI assistant, is the Bloom Grow feature.** The single key `ai.reed` "separates Bloom from Bloom Grow." |
| **Bloom Flourish** | `ai.reed` + `coaching` | Everything in Grow, plus the `coaching` key, which adds the SOBO human-coaching hand-off inside Reed. AA (tenant one) is seeded at Flourish. |
| *(add-on)* | `ai.prospect_research` | The Prospect Research module (funder briefs + discovery). Sold independently of the three tiers. |

### Important nuance for marketing copy

The honest formulation for the website is: **"At Bloom Grow you unlock Reed,
BloomOS's AI assistant."** It is *not* accurate to say all AI features unlock at
Grow — as built today:

1. Only Reed is enforced server-side by the `ai.reed` entitlement. The other
   admin AI features (briefings, Grant Coach, next-move, acknowledgments,
   finance suggestions, transcripts) check authentication only and are available
   to any provisioned tenant regardless of tier.
2. Prospect research is its own paid key, not part of the Grow bundle, and is
   enforced only at the module layout, not in the API routes themselves.

If the intent is that *all* AI capabilities are a Grow-and-up benefit, the
routes in §3's third table need `requireEntitlement` gates (a code change), and
`ai.prospect_research` needs a decision about which bundle it belongs to.

## 5. Current state of AI disclosure on the marketing site

- The homepage, `/the-app`, `/impact`, and `/for-adults` contain **zero**
  mentions of AI, Claude, or machine learning.
- The only public AI language today is thematic: "AI & Machine Learning" as a
  curriculum track, and AI-narrative slides in the `/update` investor decks
  ("AI augments the adult, it never replaces them").
- The product's actual AI usage is documented only inside BloomOS
  (`/admin/howto`: "Meet Reed — AI, used carefully") and in
  `docs/trust/subprocessors.md`.

**Recommended disclosure points for the site** (all true as built):

1. AI features are powered by Anthropic's Claude; Anthropic is a listed
   subprocessor and model inputs are not used to train models per our agreement.
2. Career matching for middle schoolers is deterministic — AI never picks a
   child's results, never sees their name or any free text, and never generates
   a salary or education figure.
3. In BloomOS, AI narrates and drafts; humans decide. AI never sends email,
   moves money, files anything, or writes legal/tax language. Every figure in an
   AI briefing comes from computed data, not the model.
4. Reed, the BloomOS AI assistant, is included starting at the Bloom Grow plan.
5. All AI usage is spend-capped per organization and fails gracefully — the
   product works without it.
