# Spec: Reed's Proposal Review

Upgrade of the Grant Coach (specs history: PRs #364, #365) from Fast Forward's
tech-nonprofit lens to Bloom's own audience-aware proposal review, voiced as
Reed.

## Problem statement

The coach on the grant page is Fast Forward's tool wearing Bloom's clothes: it
reviews every proposal as a *tech* nonprofit pitch read by a *skeptical
institutional program officer*, it force-rates "AI responsibility" on every
draft, and the panel leads with another organization's brand. Bloom's users
raise from four very different readers — institutional foundations, family
foundations, corporations, and individual donors — and a proposal that would
sail past a program officer can die on a trustee's kitchen table or in a CSR
manager's internal pitch. The review should read the draft the way *the actual
audience* will, speak as Reed (Bloom's in-house strategist), and default that
audience from what Bloom already knows about the funder.

## Scope

**In:**
- Rebrand: panel becomes **"Reed's Proposal Review"**; Reed persona and voice
  in the system prompt; Fast Forward credit moves to a discreet footer line
  ("Built on ideas from Fast Forward's AI Grant Writing Coach (CC BY 4.0)")
  — required by the license, no longer the headline.
- Universalize: reviewer persona reads nonprofit proposals generally;
  "tech model" → "delivery model" in team capacity; tech-flavored examples
  generalized; "stay in scope" covers all nonprofit asks.
- **Critic with light recommendations**: Reed still never drafts proposal
  copy. Each gap may carry one directional suggestion (what to add/reframe and
  the kind of evidence), never sentences to paste. Safety block keeps
  refine-don't-write, never-fabricate, PII, no-deception verbatim.
- **Audience lens** — four lenses, one engine:
  - `institutional_foundation` — reader: a program officer defending the
    grant to a committee against published strategy. Emphasis: theory of
    change, outcomes evidence, organizational capacity, strategic fit.
  - `family_foundation` — reader: a trustee (often family, often unstaffed)
    giving from values and legacy. Emphasis: mission resonance, trust in
    leadership, story, stewardship of past gifts; penalizes jargon-heavy
    logic-model language that reads cold.
  - `corporation` — reader: a CSR / community-affairs manager who must
    justify the gift internally as business value. Emphasis: brand
    alignment, employee engagement, geographic overlap, clean reportable
    metrics, reputational safety; flags foundation-style proposals sent to a
    corporate reader.
  - `individual_donor` — reader: the donor themselves — no committee, no
    rubric. Emphasis: emotional connection backed by credibility, what this
    specific gift makes happen, confidence and pride; flags rigor without
    warmth. Reviewer-voice prompts drop the "program officer" frame.
  - Mechanics: every run's user message carries a lens block (reader persona
    + what this reader weighs + objection voice). The scorecard swaps in one
    audience-specific criterion (strategic fit / values & relationship fit /
    partnership value / donor connection). Mechanical prompts (weakest
    paragraph, impact check, theory of change…) share the lens block but keep
    their structure.
  - Rule: pasted funder materials always beat the lens for *criteria*; the
    lens shapes voice and emphasis only.
- **Conditional AI criterion**: the AI-responsibility teardown runs only when
  the draft makes AI/tech claims; otherwise it is silently omitted from the
  scorecard (no "not rated" noise). The "AI check" deep-dive chip remains
  always available.
- **Lens default from the funder record** (best-effort, always overridable in
  a visible picker):
  1. funder constituent `type = 'person'` → individual donor
  2. `fr_prospects.type` via `constituent_id`: `corporate` → corporation,
     `individual` → individual donor
  3. `org_name` matching /family|charitable trust/i → family foundation
  4. fallback → institutional foundation
- Spend-ledger metadata gains `lens`.
- Tests updated: lens definitions complete, lens block reaches the prompt,
  conditional-AI language, Reed anchors present, FFWD attribution string
  intact.

**Out:**
- Drafting / rewrite mode (Reed's separate drafting features own that).
- Mounting the panel on ask detail pages (grants page only, as today).
- Persisting review runs.
- Schema changes or migrations (lens default reads existing tables only).
- Per-org mission injection into the persona (waits for the core fence spec's
  prompt parameterization).
- Renaming code modules — `grantCoach*.ts` file names stay; only user-facing
  strings change.

## Architecture sketch

Almost entirely a prompt-layer change; the plumbing shipped in #364/#365 is
reused as-is.

```
grants/[id]/page.tsx
  ├─ listCoachDocuments(supabase, grantId)            (unchanged)
  ├─ resolveDefaultLens(supabase, funderConstituentId) (NEW — reads
  │     constituents.type / org_name, fr_prospects.type; pure fallback chain)
  └─ <ReedProposalReview prompts docs lens=default …/>  (renamed panel)
        │  lens picker (4 options, default preselected)
        ▼
POST /api/admin/grants/coach            POST /api/admin/grants/coach/defend
  body += { lens }                        body += { lens }
        │  validate lens ∈ LENSES, default institutional_foundation
        ▼
lib/fundraising/grantCoach.ts
  REVIEW_SYSTEM  (Reed persona, universal, critic+light-recs, safety block)
  LENSES: Record<lensId, {label, readerTitle, lensBlock, audienceCriterion}>
  COACH_PROMPTS  (rewritten instructions; scorecard references the lens's
                  audience criterion + conditional AI rules)
  buildCoachUserPrompt({instructions, lensBlock, proposal|attachedPdf,
                        funderMaterials})
        ▼
lib/fundraising/grantCoachDocs.ts  buildCoachOpeningMessage(+lens) (small change)
        ▼
lib/ai/gateway.ts generateText (unchanged) → ledger metadata {lens, …}
```

## Staged build order

- **Phase 1 — Lens engine + prompt rewrite.** `LENSES`, Reed system prompt,
  all prompt instructions rewritten universal, conditional AI, builders take a
  lens; tests updated and passing. *Commit.*
- **Phase 2 — Routes + default resolution.** Both routes accept/validate
  `lens`; `resolveDefaultLens` on the page; ledger metadata. *Commit (folded
  with 3 if small).*
- **Phase 3 — Panel.** Rename to Reed's Proposal Review, lens picker wired to
  requests, attribution footer. *Commit.*
- **Phase 4 — Verify.** Mock-Supabase Playwright drive: default lens matches
  funder fixture, override works, both routes receive the lens; screenshots.
  *Commit + push.*

## Definition of done

- The grant page panel is titled "Reed's Proposal Review"; "Fast Forward"
  appears only in the footer credit line.
- The lens picker shows the four audiences; with a `person` funder fixture the
  default is "Individual donor", with an org funder it falls back to
  "Institutional foundation".
- A unit test proves the lens block text lands in the built user prompt for
  every lens, and that the scorecard instructions contain the conditional-AI
  rule ("silently omit" path) instead of a mandatory 8th criterion.
- Both routes reject an unknown `lens` value and default a missing one.
- The spend ledger row for a run carries `metadata.lens`.
- Full suite (`npm test`), typecheck, and lint green; Playwright drive
  screenshots show the renamed panel with the picker.

## Failure modes to watch for

- **Wrong default lens** (e.g., an unstaffed family foundation defaulting to
  institutional) → the review presses for logic models the trustee never
  wanted. Mitigation: picker is always visible and preselected—not hidden
  behind "advanced"; heuristic is conservative; wrong default is one click to
  fix.
- **Rewrite regression** — generalizing the prompts sands off the rigor that
  makes them good (rating definitions, specificity penalty, aspirational-claim
  cap) and reviews turn to mush. Mitigation: keep the structural spine and
  penalty rules near-verbatim where they're audience-neutral; tests freeze the
  anchor phrases.
- **Lens vs. pasted funder materials conflict** — corporate RFP pasted while
  lens says institutional → contradictory instructions. Mitigation: explicit
  precedence rule in the prompt (materials win on criteria; lens shapes voice),
  and the assessment names its criteria source line as today.
- **"Light recommendations" creep** — Reed starts writing paragraphs. The
  safety block's refine-don't-write stays verbatim and recommendations are
  capped to direction + evidence type in each prompt's output format.
- **Default-lens queries slow the page** — two extra reads on grant load.
  Mitigation: single-row indexed lookups, fired in the existing Promise.all,
  fail-open to the fallback lens.
