# Playbook Proposal — Bloom OS (reference app #3)

**What this is.** A study of Bloom OS against the Sobo Consulting App-Building
Playbook and its Team Esface addition, sorted into what the app confirms,
diverges from, adds, and contradicts, with a prioritized set of changes to fold
into the method. Bloom OS is the third reference app, so a pattern it shares with
Trellis or Esface is now confirmed across two apps and graduates from feature to
method. Nothing in either playbook was edited; this is the review to fold in.

**One caveat up front.** `SOBO_PLAYBOOK.md` (the base) is not in this repo root.
I worked from the section structure the Esface addition references (§1 doctrine,
§2 stack, §3.1 auth, §3.2 RLS, §3.3 AI, §3.5 voice, §3.6 integrations, §5 design,
§6 gates, §7 build) plus `Sobo_Playbook_TE_ADDITION.md` in full. Where the exact
base prose would change a recommendation I have flagged it. Paste the base and I
will tighten the section pointers.

Date: 2026-06-30. Reference app: `remi-sobo/ambition-angels` (the Bloom OS admin
under `app/admin`, `lib/admin`, `lib/agents`, `supabase/`). The public marketing
site in the same repo is incidental to the method.

---

## What Bloom OS is (the 30-second map)

- **Stack.** Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres +
  Auth + Storage), Anthropic Claude, Stripe, Resend, HubSpot, Google. Vercel.
  Same family as both prior apps. `package.json`.
- **Shape.** An internal operating system for one nonprofit (finance,
  fundraising, ops, board, program), installable as a PWA, with a documented
  five-ring path to becoming multi-tenant SaaS. `docs/bloomos/07-roadmap.md`.
- **Auth.** Cookie-based Supabase Auth. Session refreshed in middleware, user
  resolved server-side, membership row proves access. `lib/admin/auth.ts`.
- **Wall.** A tenant wall on `org_id`, gated by a single permission function that
  both RLS and app code call. `supabase/migrations/create_bloomos_core.sql`.
- **AI.** Five task-tiered agents (Reed, funder research, prospect discovery,
  next-best-action, briefing) plus a few raw-HTTP routes. Forced structured
  output, prompt-cached, per-org spend caps, propose-and-confirm for writes.
  `lib/agents/*`.
- **Gates.** Typecheck, lint, unit tests, and a real cross-role RLS leak test in
  CI, plus a migration-enumeration guard. `.github/workflows/`, `scripts/test-rls.sh`.

---

## Section 2 — The four buckets

### CONFIRMS (Bloom independently does what the method says)

1. **App Router + cookie auth (Esface A1, cookie shape).** Bloom resolves the
   user from the session cookie, refreshed in middleware, read server-side; route
   handlers re-verify because they are reachable as raw POSTs. `middleware.ts`
   calls `updateSession()`; `getOrgContext()` reads `auth.getUser()` then a
   membership row in `lib/admin/auth.ts`. **Decisive: Bloom and Esface now agree
   against the base.** App Router cookie auth is the default for UI-heavy apps;
   the base's Pages Router + bearer `requireUser` is Trellis-only.

2. **Resolve the access scope server-side (base doctrine #3, Esface A2).** The
   scope that gates a row (`org_id` + role) is never trusted from the client; it
   is read from the authenticated user every request, and service-role only runs
   after that check. `lib/admin/auth.ts:28`, `app/api/admin/plan/goals/[id]/route.ts`
   hand-scopes `.eq("org_id", ctx.orgId)` on every service-role query.

3. **SECURITY DEFINER helper, pinned search_path, denied to anon (Esface A2/§6).**
   `private.has_permission(p_org, p_perm)` is `security definer`, `set search_path
   = ''`, lives in the `private` schema, and is the single predicate every RLS
   policy reads. `supabase/migrations/create_bloomos_core.sql`,
   `pin_function_search_path.sql`. Third app to prove the recursion-and-leak-safe
   definer-helper pattern.

4. **RLS-first with an app-level re-check (Esface A3).** Components and routes
   read through the RLS-bound session client; app code additionally calls
   `hasPermission()` to refuse cleanly ("you don't have access to finance")
   instead of returning the empty set RLS would. `lib/admin/permissions.ts`.
   **Bloom and Esface agree; A3 is right.**

5. **Forced structured output (Esface A4, first half).** Every agent forces a
   single tool call (`tool_choice: { type: "tool", name: "submit_*" }`) and
   re-validates the model's tool input at the boundary, coercing hallucinated ids
   to null rather than persisting a dangling row. `lib/agents/next-best-action/agent.ts`
   drops any `opportunity_id` not in the real candidate set. **Two apps; graduates.**
   (Mechanism differs from Esface, see DIVERGES.)

6. **Deterministic first, LLM for the gap (Esface A4, second half).** The morning
   briefing computes every fact and tier in SQL and rules; the model only narrates
   under a hard "use only these facts" prompt, and a deterministic fallback runs
   when the key is absent. `lib/admin/briefing/narrate.ts` (`fallbackNarrative`).
   **Two apps; graduates.**

7. **Zone-based theming (Esface A7).** One `.admin-shell` wrapper repoints CSS
   variable channel-triples so the same components repaint into a cream workspace,
   an espresso rail, and warm tiles, with no component forks. `app/globals.css`,
   `tailwind.config.ts`. **Two apps; graduates.** Bloom refines it: tokens are
   space-separated RGB channels (`--c-orange: 232 80 10`) so Tailwind `/opacity`
   works on every variable.

8. **The gates apply to scoped tables, enforced in CI (Esface A6).** Bloom is
   ahead of Esface here: a cross-role RLS leak test seeds rows and asserts owner
   vs staff vs finance vs board_viewer vs anon visibility, and a migration
   enumeration guard fails the build when a migration is on disk but not in the
   ordered apply list. `supabase/tests/rls-leak-test.sql`, `scripts/test-rls.sh`,
   `.github/workflows/rls-test.yml`. This is the reference implementation A6 asks for.

9. **Real mobile shell at ~390px (base §5 mobile).** Installable PWA scoped to
   `/admin`: standalone manifest, `viewportFit: cover`, safe-area-inset math on a
   notch-aware top bar and a bottom tab dock, network-first service worker.
   `app/admin/manifest.webmanifest/route.ts`, `app/admin/_components/MobileTabBar.tsx`.

10. **Prompt caching at the AI boundary (base §3.3).** Every agent marks its
    system prompt `cache_control: { type: "ephemeral" }`, and cost accounting
    folds `cache_read_input_tokens` back in. `lib/agents/reed/client.ts`.

11. **Propose-and-confirm before a write (base §3.3).** Reed writes plan changes
    to `reed_plan_proposals` (status `proposed`); finance lands AI-found money in
    `fin_reconciliation_items` (status `pending`). A human accept route is the
    only path into the real plan or ledger. `app/api/reed/proposals/[id]/route.ts`.

### DIVERGES (same job, different way)

1. **Structured-output mechanism: hand-rolled typeguards vs Zod.** Bloom forces
   the tool call, then validates with bespoke `assert*` functions and inline
   narrowing; Esface defines the shape once in Zod and re-validates with the same
   schema (`src/lib/plan/generate-ai.ts`). **Adopt Esface's way as the default.**
   One Zod schema can drive both the API output format and the boundary re-check,
   so the shape has a single source; Bloom's typeguards drift from the tool's
   `input_schema` by hand. Keep Bloom's `tool_choice` forcing, which is the
   API-level half both should do. Reference for the method: `generate-ai.ts`
   (Esface) for the Zod half, `lib/agents/next-best-action/agent.ts` (Bloom) for
   the id-coercion half.

2. **Permission re-check: a shared DB authority vs a bespoke app function.** Both
   apps re-check in app code for a clean 403 (A3). Esface uses a relationship
   function (`isAuthorizedForAthlete`); Bloom routes the app check through the
   exact same DB function the RLS policy uses, via a public `has_permission` RPC
   shim. `lib/admin/permissions.ts`. **Prefer Bloom's way when the app has a role
   or permission model:** one authority, no chance of the app and the database
   disagreeing. See ADDS #1.

3. **Model selection: hardcoded constants, not env-overridable.** Bloom tiers by
   task (Sonnet for conversational and breadth work, Opus for funder research and
   finance categorization) but the model ids are exported constants, not env
   reads. `lib/agents/reed/cost.ts`, `lib/finance/ai-categorize.ts`. Esface also
   hardcodes its tiers. **Two apps now choose constants over env override**, which
   says the base's "env-overridable" clause is Trellis-only. Recommendation:
   make tiering-by-task mandatory and env-override optional (see proposal P6).

### ADDS (reusable, neither document has)

1. **One permission authority for RLS and app code.** Roles map to permissions in
   a `role_permissions` table; a single `has_permission(org, perm)` SECURITY
   DEFINER function answers for both the RLS policy and the app's clean-403 check.
   Changing who can do what is a data change, not a schema change, and the two
   layers can never disagree. `create_bloomos_core.sql`, `lib/admin/permissions.ts`.
   Slots into §3.2 / A3 as the refinement: "when there is a role model, give RLS
   and the app one shared authority."

2. **Per-tenant AI spend cap backed by a cost ledger.** Each agent writes
   `cost_usd` (and token counts) to an activity log; the route sums month-to-date
   and checks it BEFORE the model call, with a soft warn threshold and a hard cap.
   Reed: `$18` warn, `$25` hard. `lib/agents/reed/cost.ts`,
   `app/api/reed/ask/route.ts`. The base §3.3 names "spend" abstractly; this is
   the concrete reference. Strong ADD.

3. **Propose-and-confirm as a first-class surface, not just a UI nicety.** AI
   output is inert: it writes a proposal row with a status, and a human accept
   route is the only code path that touches the system of record. Bloom proves it
   in two places (Reed plan proposals, finance reconciliation), and the team's own
   reconcile skill states the doctrine ("post as PROPOSALS for a human to accept,
   never books money directly"). This generalizes to any app that lets an LLM near
   a database. Slots into §3.3 as its own rule, paired with A4.

4. **A separate automation surface authenticated by capability URL.** Bloom
   exposes a tiny MCP server (`create_task`, `list_my_tasks`) at
   `app/api/mcp/[secret]/route.ts`, authenticated by a rotatable secret in the
   path, running service-role but constrained to a hardcoded two-person scope. The
   reusable rule: an agent or automation surface is a second front door; gate it
   with an opaque rotatable secret and constrain it to a minimal, explicitly
   scoped toolset, never the full data layer. Candidate (1 app). It is also a
   weakness, see CONTRADICTS.

5. **Import an external system into a read-only staging mirror, then promote.**
   HubSpot lands in `hs_*` tables that members cannot write; a job promotes rows
   into the spine (constituents, gifts) idempotently by `external_ids`, and the
   spine, not the mirror, is the system of record. `mark_hs_staging_readonly.sql`,
   `import_hubspot_to_constituents.sql`. This is the data-import analog of Esface
   A10's media pattern. Candidate (1 app); generalize as "mirror is never the
   source of truth."

6. **Encrypted provider-token store.** Third-party OAuth refresh tokens are stored
   AES-256-GCM at the app layer in a `connections` table (service-role only, RLS
   deny-all), explicitly not Supabase pgsodium/TCE (deprecated). `lib/google/connection.ts`,
   `docs/bloomos/04-security-compliance.md` §1. Add to §3.6 as the rule for any
   stored third-party credential. Candidate (1 app).

7. **An immutable, partitioned audit log that doubles as a disclosure ledger.**
   `audit_log` is range-partitioned by month, has update/delete/truncate revoked
   from app roles, captures sensitive READS (which triggers cannot see), and is
   designed to answer regulator disclosure requests. `docs/bloomos/04-security-compliance.md`
   §2. The generalizable core (immutable, partitioned, logs reads not just writes,
   true immutability from an off-platform export) belongs in §6; the FERPA framing
   stays in Bloom's docs. Candidate (1 app).

### CONTRADICTS (violates a rule; decide app vs rule)

1. **The voice validator is not shared and not applied everywhere (§3.5, Esface
   A5). The rule is right; the app is wrong.** Only `stripEmDashes` exists, defined
   inline in one route (`app/api/shannon/route.ts`), applied to one decision-tool
   path. The other surfaces (Reed, funder briefs, next-best-action, prospect
   discovery, finance categorize, the briefing narrative, the public career and
   acknowledgment routes) ship model text with no sweep. **Bloom and Esface now
   both prove A5 by violating it**, which is decisive evidence the rule belongs in
   the method, and a backport for both apps. Fix the app; keep the rule.

2. **Rate limiting is wired for some AI routes but not the public ones (base
   rate-limit rule).** A clean in-memory limiter exists (`lib/rate-limit.ts`) and
   the funder-research route uses it (5 per 10 minutes), but the public,
   unauthenticated, model-calling routes (`career-quiz`, `career-match`,
   acknowledgment draft) and the donation routes have none. The util exists; the
   call sites are missing. App is wrong on the public surface. Backport.

3. **Graceful degradation is the exception, not the rule (§3.3).** Only the
   briefing degrades to deterministic prose when the key is missing; every other
   agent throws. `lib/agents/*` all `throw new Error("...: ANTHROPIC_API_KEY must
   be set")`. The method says degrade; the briefing's fallback is the model to
   copy. App is wrong. Backport.

4. **No config-integrity gate on design tokens (Esface A6).** Bloom has the
   isolation and enumeration gates but nothing freezes the token set, so
   `tailwind.config.ts`, `globals.css`, and `lib/admin/typeScale.ts` can drift
   from `docs/bloomos/06-design-system.md` silently. This is the exact gap A6 was
   written to close. App is wrong. Backport.

5. **Doc drift contradicts the live-docs rule (§7 operating docs).** Three live
   examples: `CLAUDE.md` says "the only tests are availability.test.ts" while 13
   test files and two CI workflows exist; `middleware.ts`'s header still describes
   the retired `admin_auth` shared-password cookie while the code uses Supabase
   memberships; `docs/bloomos/02-current-state.md` still calls auth a
   "password-cookie with plaintext secret." The method already warns about drift;
   Bloom is the worked failure. App is wrong. Backport.

---

## Decisive cross-app calls (the ones you asked for by name)

**Bloom OS + Esface agree against the base playbook:**

- **App Router + cookie auth** beats Pages Router + bearer for UI-heavy apps (A1).
- **RLS-first with an app-level re-check** beats "service-role only after a
  membership check" as the default (A3).
- **Structured output + deterministic-first** are method, not feature (A4).
- **Zone theming** is method (A7).
- **The voice validator rule is right**, proven by both apps violating it (A5).
- **Models are chosen as task-tiered constants, not env-overridable.** Two apps
  reject the base's env-override clause; treat it as Trellis-only.

**Bloom OS sides with the base against the Esface addition (so the "addition" was
Esface-only):**

- **The wall is a tenant.** Bloom isolates by `org_id`, like Trellis isolates by
  `household_id`. Esface's relationship wall (coach to athlete) was the
  domain-specific instance. A2's generalization to "resolve the access scope
  server-side, the noun varies" is correct and stays; but "tenant" is the majority
  case (two of three apps), so the doc should lead with the tenant instance and
  present the relationship wall as the variant, not the other way around.
- **A named assistant is present.** Trellis has Cy, Bloom has Reed; only Esface
  has none. A9 ("character optional") holds, but the default leans toward having
  one. Bloom adds the useful refinement that the character can be a strictly
  permission-bounded, read-only, propose-and-confirm tool persona, not a free
  agent: Reed reads through RLS, refuses via the shared permission authority, and
  never writes without a human accept.

---

## Section 3 — Prioritized proposal

Highest value first. Each names the document and section it touches and gives
proposed prose in the playbook's voice (no em dashes, rule plus one pointer).

**P1. Graduate App Router + cookie auth to the base default (base §2 stack table,
§3.1 auth).** Two apps now run it.
> Default to App Router with cookie-based Supabase Auth for any app with real UI.
> Refresh the session in middleware, resolve the user server-side, and re-verify
> in every route handler and server action because they are reachable as raw
> POSTs. Pages Router with a bearer `requireUser` is the right shape only when the
> app is mostly API routes. Reference: `lib/admin/auth.ts` (Bloom),
> `src/lib/supabase/middleware.ts` (Esface).

**P2. Make "one permission authority for RLS and app" the §3.2 / A3 refinement.**
> When the app has roles or permissions, give the database and the app one shared
> authority. Map roles to permissions in a table, expose it as one SECURITY
> DEFINER function, and have both the RLS policy and the app's clean-403 check call
> it. Changing access is then a data change, and the two layers cannot disagree.
> Reference: `private.has_permission` in `create_bloomos_core.sql` and the app
> shim in `lib/admin/permissions.ts`.

**P3. Add per-tenant AI spend caps to §3.3.**
> Cap model spend per tenant. Write the cost of every call to an activity log, sum
> it month-to-date, and check the cap before the next call, with a soft warn
> threshold below a hard stop. Reference: `lib/agents/reed/cost.ts` and the
> pre-call check in `app/api/reed/ask/route.ts`.

**P4. Add propose-and-confirm as its own §3.3 rule, paired with A4.**
> When an LLM writes to the database, make its output inert. Write a proposal row
> with a status, and let a single human accept route be the only code path into
> the system of record. Reference: `app/api/reed/proposals/[id]/route.ts` (Reed),
> the finance reconcile inbox, and the team's own reconcile skill doctrine.

**P5. Strengthen A4's structured-output rule to prefer Zod, keep tool forcing.**
> Force a single structured tool call so the model cannot answer in prose, then
> re-validate with one Zod schema that also defines the API output shape, so the
> contract has a single source. Coerce hallucinations defensively: an invented
> foreign key becomes null, not a dangling row. Reference: `generate-ai.ts`
> (Esface) for the Zod half, `lib/agents/next-best-action/agent.ts` (Bloom) for
> id coercion.

**P6. Correct the model-selection rule (§3.3).**
> Tier the model by task (cheap and fast for conversation and breadth, a stronger
> model for research and judgment). Hold the tiers as named constants near their
> cost model. Env override is optional, not required; two reference apps choose
> constants. Reference: `lib/agents/reed/cost.ts`, `lib/finance/ai-categorize.ts`.

**P7. Reframe A2 so tenant leads and relationship is the variant (Esface A2).**
> Resolve the access scope server-side, always. The noun varies: a tenant id
> (`org_id`, `household_id`) is the common case; a relationship graph (coach to
> athlete, parent to child) is the variant when one org has many internal
> relationships. Same discipline either way: the scope is read from the
> authenticated user every request, never trusted from the client. References:
> `org_id` in `create_bloomos_core.sql` (Bloom, tenant), the recursion helpers in
> Esface (relationship).

**P8. Promote the audit log and encrypted-token rules into §6 / §3.6.**
> Store any third-party credential encrypted at the app layer (AES-256-GCM), in a
> service-role-only table, never in a deprecated platform vault. For regulated
> data, make the audit log immutable and partitioned, log sensitive reads and not
> just writes, and take true immutability from an off-platform export. References:
> `lib/google/connection.ts` and `docs/bloomos/04-security-compliance.md` §1 to §2.

**P9. Note in A6 that the config-integrity gate covers design tokens, with a
reference.** Bloom has the isolation and enumeration gates but not the token
freeze; the method should keep all three named together so the next app does not
ship two of three. Reference for the two it does have:
`supabase/tests/rls-leak-test.sql` and `scripts/test-rls.sh`.

**P10. Reinforce the Phase 0 recon rule in §7 with the "findings doc" discipline.**
> Phase 0 recon is a committed artifact, not a mental step. Write the findings to a
> file before building; it routinely catches work already shipped and constraints
> stricter than the reference, and it is the cheapest doc-drift detector you have.
> Reference: `specs/*phase0-findings*.md` (Bloom).

---

## Backport into this app (method rules Bloom OS should adopt)

1. **One shared voice validator at every AI boundary (§3.5 / A5).** Replace the
   single inline `stripEmDashes` with a shared `violatesVoice` / `cleanVoice`
   utility and run it on every surface that emits model text to a human: Reed,
   funder briefs, next-best-action, prospect discovery, finance categorize, the
   briefing narrative, and the public career and acknowledgment routes.
2. **Graceful degradation on every AI surface (§3.3).** Every agent should fall
   back like the briefing does instead of throwing on a missing key or a failed
   call. Copy `fallbackNarrative` in `lib/admin/briefing/narrate.ts`.
3. **Rate-limit the public, unauthenticated, model-calling and donation routes
   (base).** The limiter exists; wire `lib/rate-limit.ts` into `career-quiz`,
   `career-match`, the acknowledgment draft route, and the donation routes.
4. **A config-integrity gate that freezes design tokens (A6).** Add a test that
   pins `tailwind.config.ts`, `globals.css`, and `lib/admin/typeScale.ts` against
   a checked-in manifest so they cannot drift from `06-design-system.md`.
5. **Prompt-cache the raw-HTTP routes too (§3.3).** The five agents cache; the
   public career, acknowledgment, and decision routes do not.
6. **Fix the doc drift the method warns about (§7).** Update `CLAUDE.md`'s "only
   one test" claim, the stale `middleware.ts` auth header comment, and the
   "plaintext password" line in `02-current-state.md`.
7. **Put service-role write-on-behalf sites on a greppable list (A3).**
   `notify()` writes notifications for arbitrary recipients under service-role;
   that is legitimate, but A3 wants those sites confined and documented, as Esface
   does with `service-notify.ts` and `service-award.ts`.

## Promote into the playbook (Bloom patterns worth generalizing)

Marked by how many of the three apps now share each pattern.

- **App Router + cookie auth — graduate (2: Bloom, Esface).** P1.
- **RLS-first with an app-level re-check — graduate (2: Bloom, Esface).** Confirms A3.
- **Structured output + deterministic-first — graduate (2: Bloom, Esface).** Confirms A4, P5.
- **Zone theming — graduate (2: Bloom, Esface).** Confirms A7.
- **The gates apply to scoped tables, with a CI reference implementation —
  graduate (2: Bloom, Esface).** Confirms A6; Bloom supplies the reference. P9.
- **One permission authority shared by RLS and app — candidate (1: Bloom).** P2.
- **Per-tenant AI spend cap with a cost ledger — candidate (1: Bloom), but the
  base already names "spend", so the concrete pattern graduates.** P3.
- **Propose-and-confirm as a first-class staging surface — graduate (2: Bloom and
  the team's reconcile-skill doctrine; Trellis/Esface to confirm).** P4.
- **Capability-URL automation surface, minimally scoped — candidate (1: Bloom).** ADDS #4.
- **External-system import via a read-only staging mirror — candidate (1: Bloom);
  analog to Esface A10 media.** ADDS #5.
- **Encrypted provider-token store — candidate (1: Bloom).** P8.
- **Immutable partitioned audit log as a disclosure ledger — candidate (1: Bloom).** P8.
- **Phase 0 recon as a committed findings doc — graduate (confirms base §7;
  Bloom supplies repeated worked instances).** P10.

## Stays out (keep in Bloom's own CLAUDE.md / DESIGN.md / VOICE.md / SECURITY.md)

- The navy / espresso / cream palette and channel-triple token values, Space
  Grotesk, the `.admin-shell` class name, and the type-scale strings. The zone
  *pattern* graduates; the values are a `DESIGN.md` worked example.
- Reed the persona, the starter prompts, and the specific cap values ($18/$25,
  $12/$20). The propose-and-confirm and spend-cap *patterns* graduate; the
  character and numbers stay in `VOICE.md` and Bloom config.
- The FERPA / COPPA / SOPIPA / SDPC legal map, consent-record anatomy, clearance
  tracking, and the youth-serving compliance schema. The audit-log and
  encrypted-token *patterns* graduate; the regulatory content is a `SECURITY.md`
  worked example for any youth-serving client.
- The five-ring roadmap content and the `org_id`-default-trap remediation plan.
  The ring *method* is already in §7; the Bloom-specific ring contents stay in
  `docs/bloomos`.
- The HubSpot spine-and-staging specifics. The mirror-then-promote *pattern*
  graduates; the HubSpot field mapping stays in Bloom.
