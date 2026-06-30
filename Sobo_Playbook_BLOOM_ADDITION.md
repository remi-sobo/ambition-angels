# The Sobo Playbook — Bloom OS Addition

**A v-next layer for `SOBO_PLAYBOOK.md`, extracted from a third mature app.**

> **What this is.** The base playbook was extracted from app #1 (Trellis). The
> first addition came from app #2 (Team Esface). This is the second addition,
> extracted from app #3 (Bloom OS), an internal operating system for a youth
> nonprofit. It follows the playbook's own maintenance rule: a pattern proven in a
> second app graduates from feature to method, and where the apps disagree with
> the doc, the code wins and the doc updates. With three apps, a pattern shared by
> two is now confirmed, and a place where Bloom OS agrees with the Esface addition
> against the base is decisive.
>
> **How to use it.** Read it alongside `SOBO_PLAYBOOK.md` and the Esface addition.
> Each section names the playbook (or Esface) section it amends and either
> graduates a candidate, adds a rule, corrects an over-fit, or settles a question
> the Esface addition left open. Same voice rules apply: no em dashes, tight, the
> rule plus one pointer to a reference file rather than pasted code.
>
> Reference app: `remi-sobo/ambition-angels` (the Bloom OS admin under
> `app/admin`, `lib/admin`, `lib/agents`, `supabase/`). The original reference
> stays Trellis. When this addition, the Esface addition, and the base are next
> reconciled, fold all three in and retire the addition files.

Date: 2026-06-30. Source: full audit in `PLAYBOOK_PROPOSAL_bloom.md`.

Each section is tagged with how many of the three apps now share the pattern:
**[graduate]** = 2+ apps, **[candidate]** = 1 app worth watching.

---

## B1. App Router cookie auth is now the base default — graduates Esface A1 **[graduate]**

Esface A1 offered App Router cookie auth as a second valid shape. Bloom OS runs
the same shape independently: the session is refreshed in middleware, the user is
resolved server-side, and route handlers re-verify because they are reachable as
raw POSTs. Two apps now, so this stops being an option and becomes the default.

**Rule.** Default to App Router with cookie-based Supabase Auth for any app with
real UI. Refresh the session in middleware, resolve the user server-side, re-check
in every handler and server action. Pages Router with a bearer `requireUser` is
the right shape only when the app is mostly API routes. Reference:
`lib/admin/auth.ts` (`getOrgContext` resolves user then membership),
`lib/supabase/middleware.ts` (the refresh). Promote the base §2 Framework row and
§3.1 to lead with this shape; demote bearer to the API-only case.

---

## B2. The wall is usually a tenant; relationship is the variant — refines Esface A2 **[graduate]**

Esface A2 corrected the base by renaming the wall from "tenant" to "access scope,"
because Esface isolates by a relationship graph. Bloom OS isolates by `org_id`,
like Trellis isolates by `household_id`. So two of three apps are tenant walls.
A2's generalization is right (the noun varies, the discipline is fixed), but the
doc should lead with the tenant case and present the relationship wall as the
variant, not the reverse.

**Rule.** Resolve the access scope server-side, always. The common case is a
tenant id (`org_id`, `household_id`); the variant is a relationship graph (coach
to athlete, parent to child) when one org has many internal relationships. The
scope is read from the authenticated user every request, never trusted from the
client, and service-role runs only after the check. Reference: `org_id` resolution
in `lib/admin/auth.ts` and the per-domain policies in
`supabase/migrations/enable_rls_per_domain.sql` (Bloom, tenant); the recursion
helpers in Esface (relationship).

---

## B3. One permission authority for RLS and app — adds to §3.2, refines Esface A3 **[candidate]**

Esface A3 established RLS-first with an app-level re-check for a clean 403. Bloom
confirms A3 and adds the refinement that closes the gap A3 leaves open: when the
app re-check and the RLS policy are written separately, they can drift. Bloom has
them call one function.

**Rule.** When the app has roles or permissions, give the database and the app one
shared authority. Map roles to permissions in a table, expose it as a single
SECURITY DEFINER function with a pinned `search_path`, and have both the RLS policy
and the app's clean-403 check call it. Changing access becomes a data change, and
the two layers cannot disagree. Reference: `private.has_permission(p_org, p_perm)`
in `supabase/migrations/create_bloomos_core.sql`, called from RLS policies and from
the app via the shim in `lib/admin/permissions.ts`.

---

## B4. Cap AI spend per tenant with a cost ledger — adds to §3.3 **[candidate, concretizes a base rule]**

The base §3.3 names spend abstractly. Neither addition gave the mechanism. Bloom
does: every agent writes the dollar cost of a call to an activity log, and the
route sums month-to-date and checks it before the next call.

**Rule.** Cap model spend per tenant. Write `cost_usd` and token counts for every
call to an activity log, sum month-to-date, and check the cap before the call, with
a soft warn threshold below a hard stop. The cap moves onto the plan or entitlement
row when billing lands. Reference: `lib/agents/reed/cost.ts` (the cost model and
the $18 warn / $25 hard ceiling), `app/api/reed/ask/route.ts` (the pre-call check).

---

## B5. Propose-and-confirm is a surface, not a nicety — adds to §3.3 **[graduate]**

Esface A4 made AI output safe to persist (structured, re-validated). Bloom adds the
layer above it: AI output does not write the system of record at all. It writes an
inert proposal, and a human accept route is the only code path into the real data.
The team's own reconcile skill states the same doctrine ("post as PROPOSALS for a
human to accept, never books money directly"), so the pattern is proven twice.

**Rule.** When an LLM writes to the database, make its output inert. Write a
proposal row with a status (`proposed`, `pending`), and let a single human accept
route be the only path into the system of record. This is distinct from structured
output: structure makes the write safe, the proposal gate makes the write a human
decision. Reference: `app/api/reed/proposals/[id]/route.ts` (Reed plan proposals),
the finance reconcile inbox (`fin_reconciliation_items`).

---

## B6. Structured output: one schema, force the tool — reinforces Esface A4 **[graduate]**

Bloom confirms A4 (every agent forces a single tool call and re-validates at the
boundary, coercing a hallucinated foreign key to null). It diverges on mechanism:
Bloom hand-rolls typeguards that can drift from the tool's declared schema, where
Esface defines the shape once in Zod. Esface's way is better.

**Rule.** Force a single structured tool call so the model cannot answer in prose
(`tool_choice` pinned to one submit tool), then re-validate with one Zod schema
that also defines the API output shape, so the contract has a single source. Coerce
hallucinations defensively. Reference: `generate-ai.ts` (Esface) for the Zod half;
`lib/agents/next-best-action/agent.ts` (Bloom) for dropping any id not in the real
candidate set.

---

## B7. Tier the model with constants; env override is optional — corrects base §3.3 **[graduate]**

The base makes models env-overridable. Bloom tiers by task (Sonnet for
conversation and breadth, Opus for research and finance judgment) but holds the
ids as named constants near their cost model, not env reads. Esface also hardcodes
its tiers. Two apps reject env override, so it is a Trellis-only convenience.

**Rule.** Tier the model by task and hold the tiers as named constants beside their
cost model. Env override is optional, not required. Reference:
`lib/agents/reed/cost.ts`, `lib/finance/ai-categorize.ts` (Opus with low-effort
adaptive thinking for a precision task).

---

## B8. The voice validator, proven a third time by its absence — reinforces §3.5 / Esface A5 **[graduate]**

Esface proved A5 by violating it. Bloom violates it harder: the only sweep is a
`stripEmDashes` defined inline in one route and applied to one decision-tool path;
seven other AI surfaces ship model text with no sweep. Two apps now fail the same
way, which is decisive evidence the rule is right and that "every boundary" is the
hard part.

**Rule.** Unchanged from A5, restated with more force. Voice detection and repair
is one shared utility applied at every AI boundary, including the ones that are
easy to forget: background jobs, edge functions, notifications, and the raw-HTTP
routes that bypass the agent layer. A surface that emits model text to a human runs
the sweep, or the rule is not in force. Reference (the anti-pattern to replace):
the lone `stripEmDashes` in `app/api/shannon/route.ts`.

---

## B9. The gates have a reference implementation — reinforces Esface A6 **[graduate]**

Esface A6 said the isolation, enumeration, and config-integrity gates apply to
scoped tables, but Esface lacked them until an audit. Bloom now supplies the
working reference for all three, in CI: a cross-role leak test that seeds rows and
asserts owner vs staff vs finance vs board_viewer vs anon visibility, an
enumeration guard that fails the build when a migration is on disk but not in the
ordered apply list, and a design-token freeze test. A live run of the harness this
session also showed why the gate matters: the enumeration guard had been red on
main for days (eight migrations unregistered, one un-appliable from schema drift),
and PRs were merging over it. A gate only protects while it is green.

**Rule.** Ship all three gates together so the next app does not ship two of three,
and treat a red gate as a build break, not a warning to merge past. The isolation
gate is a seeded cross-role read matrix; the enumeration gate fails the build when
a new scoped table or migration ships unregistered; the config-integrity gate
freezes design tokens (and the type scale) against a checked-in manifest, so a
token change has to be deliberate. Reference: `supabase/tests/rls-leak-test.sql` +
`scripts/test-rls.sh` (isolation and enumeration), `tests/design-tokens.test.ts`
(token freeze), `.github/workflows/rls-test.yml` (the required check).

---

## B10. Encrypted credentials and an immutable audit log — adds to §3.6 and §6 **[candidate]**

Bloom holds donor financial data and minors' PII, which forced two storage
patterns the prior apps did not need.

**Rule (credentials, §3.6).** Store any third-party credential encrypted at the
app layer (AES-256-GCM), in a service-role-only table with RLS deny-all, never in a
deprecated platform vault. Reference: `lib/google/connection.ts`
(`connections.refresh_token_enc`).

**Rule (audit, §6).** For regulated data, make the audit log immutable and
partitioned (revoke update/delete/truncate from app roles), log sensitive reads and
not only writes, and take true immutability from an off-platform export. The same
log can double as the legal disclosure ledger. Reference:
`docs/bloomos/04-security-compliance.md` §2.

---

## B11. A second front door: the automation surface — adds §3.7 (new) **[candidate]**

Bloom exposes a small MCP server so an external agent (Claude running a morning
routine) can create and read tasks. It is a second access surface beyond the web
app, and it is authenticated and scoped differently.

**Rule (new §3.7).** Treat an agent or automation endpoint as a second front door.
Authenticate it with an opaque, rotatable secret (a capability URL or header), run
it server-side, and constrain it to a minimal, explicitly scoped toolset, never the
full data layer. If the secret cannot identify a user, hardcode the scope it is
allowed to act within. Reference: `app/api/mcp/[secret]/route.ts` (secret-gated,
two tools, scoped to known principals). Note the open weakness to design around:
this surface runs service-role and cannot name the calling user, so its scope must
be pinned in code.

---

## B12. Import an external system through a read-only mirror — adds to §3.6 **[candidate]**

The base integrations section did not cover importing a system of record from
another tool. Bloom does it without ever trusting the import as truth: HubSpot
lands in `hs_*` tables members cannot write, and a job promotes rows into the spine
idempotently by external id.

**Rule.** Import an external system into a read-only staging mirror, then promote
into your own system of record idempotently keyed on an external id. The mirror is
never the source of truth, and after cutover the spine owns the data. This is the
data-import analog of Esface A10's media pattern. Reference:
`supabase/migrations/mark_hs_staging_readonly.sql`,
`supabase/migrations/import_hubspot_to_constituents.sql`.

---

## B13. The assistant can be a permission-bounded tool — amends Esface A9 **[graduate of the base/Trellis side]**

Esface A9 made the named character optional (Trellis has Cy, Esface has none).
Bloom has Reed, so two of three apps carry a named assistant. A9 still holds, but
the default leans toward having one. Bloom adds the refinement that the character
need not be a free agent.

**Rule.** A named assistant is the common choice; the quiet-tool path is the
variant. Either way, bound the assistant: it reads through RLS, refuses via the
shared permission authority rather than returning an empty set, and writes only
through propose-and-confirm. The persona is a surface; the permission model is the
substance. Reference: Reed's read tools call `hasPermission` and its writes land in
`reed_plan_proposals` (`lib/agents/reed/`).

---

## B14. Phase 0 recon is a committed artifact — reinforces §7 **[graduate]**

The base §7 includes Phase 0 recon. Bloom proves the discipline pays only when the
recon is written down: its findings docs repeatedly caught work already shipped and
constraints stricter than the reference, and they are the cheapest doc-drift
detector in the repo.

**Rule.** Phase 0 recon is a committed file, not a mental step. Write the findings
before building; expect them to correct the spec. Reference:
`specs/bloomos-reed-phase0-findings.md`,
`specs/bloomos-operating-rhythm-v2-phase0-findings.md`.

---

## B15. The AI gateway is a thin seam, adopted incrementally — adds to §3.3 **[candidate]**

The base §3.3 wants one chokepoint for model calls. Bloom started with ten
scattered call sites that shared an idiom but no module, then introduced a seam
without a big-bang rewrite: a `generateText` helper for the plain text-in /
text-out routes that bakes in the key check, task-tier model choice, system-prompt
caching, the voice sweep, and a returned cost, and migrated the simple routes onto
it first. The tool-loop agents keep their bespoke loops until they are migrated one
at a time.

**Rule.** Build the chokepoint as a thin seam and adopt it incrementally, simplest
callers first, rather than rewriting the critical agents in one pass. A seam that
half the surfaces use beats a perfect one that lands as a risky rewrite. Reference:
`lib/ai/gateway.ts` (`generateText`), adopted in the career and acknowledgment
routes.

---

## B16. A unified spend ledger with a per-tenant read — extends B4 **[candidate]**

B4 capped spend per tenant from per-agent logs. Bloom adds the layer above: one
append-only `ai_calls` row per model call across every surface (membership RLS,
append-only, `org_id` with no default), written beside the per-agent logs, with a
month-to-date read and a per-org spend view. Now spend is answerable in one place
and visible to the operator, not just enforced.

**Rule.** Write every model call to one per-tenant ledger and surface the
month-to-date total back to the operator. The ledger is the seam a global cap, a
billing line, and a usage card all read from. Reference:
`supabase/migrations/create_ai_calls_ledger.sql`, `lib/ai/ledger.ts`
(`logAICall` / `spendSummary`), the AI-usage card in `app/admin/settings/page.tsx`.

---

## B17. Make the model's output coercion a pure, offline-tested function — reinforces A4 / B6 **[graduate]**

Esface A4 unit-tested its generation offline; Bloom proves the same for the
structured agents by extracting the hallucination-coercion step (drop invented
ids, force known enums, clamp, truncate, sort) out of the API call into a pure
exported function, then golden-testing it with no key and no network. The safety
net between a hallucinating model and the database stops being untested glue.

**Rule.** Keep the model's output coercion pure and separate from the API call, so
the safety properties are golden-tested offline. A structured-output agent without
a test of its coercion is one schema change away from writing junk. Reference:
`parseRecommendations` / `parseCandidates` in `lib/agents/*` with
`tests/nba-parse.test.ts` and `tests/discovery-parse.test.ts`.

---

## Appendix — files to copy from Bloom OS

Add to the base playbook's "copy almost verbatim" map:

- `supabase/migrations/create_bloomos_core.sql` (the `has_permission` authority and
  `role_permissions` model) plus `lib/admin/permissions.ts` (the app shim).
- `lib/agents/reed/cost.ts` + `app/api/reed/ask/route.ts` — per-tenant spend cap
  with a cost ledger, checked before the call.
- `app/api/reed/proposals/[id]/route.ts` — propose-and-confirm as the only write path.
- `supabase/tests/rls-leak-test.sql` + `scripts/test-rls.sh` — the cross-role
  isolation gate and the migration-enumeration guard, wired in CI.
- `tests/design-tokens.test.ts` — the config-integrity (design-token freeze) gate.
- `lib/ai/gateway.ts` + `lib/ai/cost.ts` + `lib/ai/voice.ts` — the AI seam: one
  text-in/text-out helper, one price sheet, one shared voice sweep.
- `lib/ai/ledger.ts` + `supabase/migrations/create_ai_calls_ledger.sql` — the
  unified per-tenant spend ledger and its month-to-date read.
- `lib/agents/next-best-action/agent.ts` + `tests/nba-parse.test.ts` — pure,
  offline-tested model-output coercion.
- `lib/google/connection.ts` — AES-256-GCM app-layer credential storage.
- `app/api/mcp/[secret]/route.ts` — a minimally scoped, secret-gated automation surface.
- `supabase/migrations/mark_hs_staging_readonly.sql` +
  `import_hubspot_to_constituents.sql` — import-through-a-read-only-mirror.

## Stays out (app-specific worked examples, keep in Bloom OS docs)

The navy/espresso/cream palette, channel-triple token values, Space Grotesk, and
the `.admin-shell` class name. Reed the persona, the starter prompts, and the
specific cap values. The FERPA/COPPA/SOPIPA/SDPC legal map, consent-record anatomy,
and clearance tracking. The five-ring roadmap contents and the `org_id`-default-trap
remediation. The HubSpot field mapping. The *patterns* they prove graduate; the
*content* stays in `CLAUDE.md`, `docs/bloomos/06-design-system.md`,
`docs/bloomos/04-security-compliance.md`, and the `specs/`.
