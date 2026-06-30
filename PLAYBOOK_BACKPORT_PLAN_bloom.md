# Bloom OS — Ringed Backport Plan

**Bringing Bloom OS up to the method's bar.** This plan takes the seven backport
items from `PLAYBOOK_PROPOSAL_bloom.md` (the places Bloom OS is weaker than the
Sobo Playbook) and sequences them into rings. Each ring ships something usable on
its own, ordered so the cheapest and highest-exposure fixes land first and the
ratcheting gate lands last so it locks in the rest.

Same conventions as the build process in §7: every ring opens with a Phase 0 recon
(read and confirm before changing), states a definition of shipped, and points at
one reference rather than pasting code. No em dashes, tight.

Date: 2026-06-30. Reference: `PLAYBOOK_PROPOSAL_bloom.md`, `Sobo_Playbook_BLOOM_ADDITION.md`.

---

## Status (updated after the first build pass)

The first execution pass reframed the plan around an AI gateway seam (see B15) and
shipped more than the original seven. Done and merged to main:

- **R0 doc drift** — `CLAUDE.md`, the `middleware.ts` auth header, and
  `02-current-state.md` corrected.
- **R3 design-token freeze gate** — `tests/design-tokens.test.ts`.
- **The shared voice utility** — `lib/ai/voice.ts`, applied to the
  acknowledgment route and the decision route; the seam exists for the rest.
- **Beyond the seven:** the AI gateway seam (`lib/ai/gateway.ts`), one cost model
  (`lib/ai/cost.ts`), the unified `ai_calls` spend ledger + per-org spend view +
  Settings card, and an offline eval harness for two agents. Plus a restored RLS
  leak gate (it had been red on main for days) and a `planned_week` schema-drift fix.

Still open from the seven (good next pass):

- **R1 rate-limit the public model-calling and donation routes** — the limiter
  exists (`lib/rate-limit.ts`); wire it into `career-quiz`, `career-match`, the
  acknowledgment draft route, and the donation routes.
- **R1 greppable service-role write-on-behalf list.**
- **R2 voice sweep + graceful degradation on the remaining AI surfaces** — Reed,
  funder research, next-best-action, prospect discovery, the briefing narrative.
  The shared utility and the deterministic-fallback pattern both exist; this is
  applying them at the boundaries that still throw or skip the sweep.

Deferred by design: the tenant-default ban (the `org_id`-default trap is still
load-bearing; `tenant-two-hardening.md` sequences the CI guard for its Phase 9).

---

## The seven backports, mapped to rings

| # | Backport | Method rule | Ring |
|---|----------|-------------|------|
| 6 | Fix doc drift (CLAUDE.md, middleware comment, current-state) | §7 live docs | R0 |
| 5 | Prompt-cache the raw-HTTP routes | §3.3 | R0 |
| 3 | Rate-limit public model-calling and donation routes | base rate-limit | R1 |
| 7 | Greppable list of service-role write-on-behalf sites | Esface A3 | R1 |
| 1 | One shared voice validator at every AI boundary | §3.5 / A5 | R2 |
| 2 | Graceful degradation on every AI surface | §3.3 | R2 |
| 4 | Config-integrity gate freezing design tokens | Esface A6 | R3 |

Rationale for the order: R0 is pure hygiene with no behavior change. R1 closes
real external exposure on the public surface. R2 is the AI-robustness ring, where a
shared utility is built once and applied across surfaces. R3 is the gate that
freezes the design tokens, landed last so it ratchets a system that has stopped
moving.

---

## Ring 0 — Hygiene (hours, no behavior change)

**Goal.** Make the docs tell the truth and close two trivial AI gaps, with zero
risk, so the later rings start from an honest baseline.

**Phase 0 recon.** Confirm the three drift sites still read as described: the
"only test is availability.test.ts" claim in `CLAUDE.md`, the retired
`admin_auth` shared-password description in the `middleware.ts` header, and the
"password-cookie with plaintext secret" line in `docs/bloomos/02-current-state.md`.
Confirm which raw-HTTP routes call the model without `cache_control`.

**Work.**
- Rewrite the stale `CLAUDE.md` testing line to name the real suite (13 vitest
  files, `npm test`, the RLS leak workflow) and the two CI gates.
- Replace the `middleware.ts` header comment with the actual Supabase-membership
  flow it now implements.
- Update `02-current-state.md` to describe the shipped Supabase Auth model.
- Add `cache_control: { type: "ephemeral" }` to the system prompts in
  `career-quiz`, `career-match`, and the acknowledgment draft route, matching the
  agent layer.

**Definition of shipped.** No doc in the repo describes auth or tests in a way the
code contradicts. Every model call that has a stable system prompt caches it.

**Reference.** The agent layer's caching idiom in `lib/agents/reed/client.ts`.

---

## Ring 1 — Close the public surface (days)

**Goal.** Stop the unauthenticated, model-calling and money-moving routes from
being abusable, and make every service-role write-on-behalf site greppable.

**Phase 0 recon.** Confirm `lib/rate-limit.ts` exists and is already used by the
funder-research route, so this is wiring, not building. Inventory every call site
of `getSupabaseAdmin()` that writes a row owned by a user other than the caller
(start with `lib/notifications/notify.ts`).

**Work.**
- Wire `rateLimit()` with `getClientIp()` into `career-quiz`, `career-match`, the
  acknowledgment draft route, `create-payment-intent`, and `save-donation`. Pick
  per-route limits (tighter on the model and payment routes).
- Add a short, named module or a comment convention that lists the service-role
  write-on-behalf sites, the way Esface confines them to `service-notify.ts` and
  `service-award.ts`. Each site states why the legitimate actor cannot write the
  row under RLS.

**Definition of shipped.** No unauthenticated route reaches Claude, Stripe, or an
insert without passing the limiter. Every service-role write-on-behalf is reachable
from one greppable list with a one-line justification.

**Reference.** `lib/rate-limit.ts` and its existing use in the funder-research
route; Esface's `service-notify.ts` for the confinement pattern.

---

## Ring 2 — The AI-robustness ring (the core of the work)

**Goal.** Every surface that emits model text runs the shared voice sweep, and
every AI surface degrades instead of throwing. This is the ring that actually
brings Bloom to the method's AI bar.

**Phase 0 recon.** List every AI boundary that emits text to a human: Reed, funder
briefs, next-best-action, prospect discovery, finance categorize, the briefing
narrative, and the public career and acknowledgment routes. For each, note whether
it currently sweeps voice (only `app/api/shannon/route.ts` does) and what it does
on a missing key or a failed call (only the briefing degrades).

**Work.**
- Build one shared utility, `violatesVoice()` / `cleanVoice()`, in `lib/` (replace
  the inline `stripEmDashes`). Apply it at every boundary from the recon list,
  including the raw-HTTP routes that bypass the agent layer.
- Give every agent a deterministic fallback the way the briefing has one: on a
  missing key or a failed or capped call, return usable non-model content rather
  than throwing. Where a deterministic answer is impossible, fail soft with a clear
  message, not a 500.

**Definition of shipped.** A grep shows every model-text boundary importing the one
voice utility. Pulling `ANTHROPIC_API_KEY` degrades every AI feature to a usable
state and crashes none.

**Reference.** `fallbackNarrative` in `lib/admin/briefing/narrate.ts` is the model
to copy for degradation; the Esface voice validator is the model for the shared
sweep.

---

## Ring 3 — The ratchet (freeze the tokens)

**Goal.** Land the third gate so the design system cannot drift, completing the
isolation, enumeration, and config-integrity trio Bloom was missing one of.

**Phase 0 recon.** Confirm the token sources of truth (`tailwind.config.ts`,
`app/globals.css` CSS variables, `lib/admin/typeScale.ts`) and the design doc they
should match (`docs/bloomos/06-design-system.md`). Decide the manifest format.

**Work.**
- Add a checked-in token manifest and a unit test that parses the three sources and
  fails the build when they drift from it. Wire it into the existing CI alongside
  the RLS leak test.
- Land it after Ring 0 to 2, so the tokens it freezes are the corrected, stable set.

**Definition of shipped.** A token change that is not reflected in the manifest
fails CI, the same way a new scoped table without an isolation test already does.

**Reference.** The enumeration guard in `scripts/test-rls.sh` is the shape to
mirror for a freeze test; Esface A6 is the rule.

---

## Notes on sequencing

- Rings 0 and 1 are independent and could land in one pass; they are split so the
  honest-docs change is reviewable on its own.
- Ring 2 is the only ring with real surface area. Build the voice utility and the
  fallback convention first, then fan them across the boundary list; treat each
  boundary as a small, separately reviewable change.
- Ring 3 must come last. A freeze gate landed early would fight the token
  corrections the earlier rings imply.
- Each ring is a dogfood opportunity: note any friction in the same weekly journal
  the roadmap already prescribes, and feed surprises back into the spec.
