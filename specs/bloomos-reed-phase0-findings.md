# Phase 0 recon findings — Reed (BloomOS AI assistant)

Read-only recon per `specs/bloomos-reed.md` Appendix C. No code, migrations, or edits made.
Date: 2026-06-25. Branch: `claude/affectionate-ritchie-5mt45g`.

**Verdict up front: the architecture in the spec matches the code in its bones, with three concrete
divergences you should resolve before Phase 1.** Details in §8. The headline one: the reference
funder agent does **not** run entirely on the session client — its data-loading helper uses the
service-role admin client. So Reed's "session-client-only" rule is a *new, stricter* constraint, not
a copy of the reference. Plan for it deliberately.

---

## 1. AI client wrapper — how Claude is called today

The funder research agent is the reference implementation.

- **SDK + client.** `lib/agents/funder-research/client.ts:23` imports `@anthropic-ai/sdk`
  (`package.json` ≈ `"@anthropic-ai/sdk": "^0.96.0"`). Lazy singleton reading `ANTHROPIC_API_KEY`:
  ```ts
  // client.ts:41-50
  function getAnthropic(): Anthropic {
    if (cached) return cached;
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Funder research agent: ANTHROPIC_API_KEY must be set");
    cached = new Anthropic({ apiKey: key });
    return cached;
  }
  ```
- **Model.** `client.ts:29` → `export const AGENT_MODEL = "claude-opus-4-7";` (Opus). The briefing
  narrative uses a different model — `claude-sonnet-4-6` (see §7). Relevant to Open Decision 7
  (per-task model choice): there is already de-facto Opus-for-agent / Sonnet-for-narrative split.
- **The call.** `client.ts:557-598` — `client.messages.create({ model: AGENT_MODEL, ... })` with a
  cached system prompt, the server-side `web_search_20250305` tool (`max_uses` capped), and a custom
  `submit_brief` tool.
- **Token + cost capture.** Tokens summed (incl. cache tokens) at `client.ts:615-627` into an
  `AgentMetrics` shape. Cost is **not** computed in the client wrapper — it's computed in the route
  from the token counts:
  ```ts
  // app/api/admin/fundraising/research/[id]/route.ts:42-48
  const OPUS_INPUT_PER_MILLION_USD = 15;
  const OPUS_OUTPUT_PER_MILLION_USD = 75;
  function estimateCostUsd(tokensInput, tokensOutput) {
    return (tokensInput * OPUS_INPUT_PER_MILLION_USD + tokensOutput * OPUS_OUTPUT_PER_MILLION_USD) / 1_000_000;
  }
  ```

## 2. The hard monthly cost cap (where it is enforced)

Enforced **in the route, before the model call** — not in the client wrapper.

```ts
// app/api/admin/fundraising/research/[id]/route.ts:34-35
const MONTHLY_BUDGET_HARD_USD = 20;
const MONTHLY_BUDGET_WARN_USD = 12;
```
```ts
// route.ts:110-148 (abridged) — sum month-to-date tokens, estimate spend, gate
const { data: mtdRows } = await supabase
  .from("fr_agent_activity_log")
  .select("tokens_input, tokens_output")
  .gte("created_at", monthStart.toISOString());
// ...sum rows -> mtdSpendUsd...
if (mtdSpendUsd >= MONTHLY_BUDGET_HARD_USD) {
  return NextResponse.json({ error: "Monthly agent budget exceeded ($20)..." }, { status: 402 });
}
```

Confirms the spec's "pre-call cap check, **402** on exceed" shape. **One thing to carry into Reed:**
this MTD query has **no explicit `org_id` filter** — it relies on RLS (or, today, single-tenant
data) to scope. For `reed_activity_log` the cap check should filter `org_id` explicitly (the spec
already says month-to-date vs the org's cap — make that an explicit `.eq("org_id", org)`), so it
stays correct once a second tenant exists.

## 3. Funder-agent route end to end

- **Entry:** `POST app/api/admin/fundraising/research/[id]/route.ts:56-311` (`id` = prospect id).
- **Auth/permission:** `route.ts:60-66` → `isAuthed()` then `getAdminUser()` (both in
  `lib/admin/auth.ts`). **No app-layer `has_permission` call.** `getAdminUser()` is display
  attribution (`"remi" | "shannon"`, derived from email) layered on the real `getOrgContext()`
  membership lookup. Org scoping of the *data* is delegated to RLS, not checked in the route.
- **Supabase client — mixed:**
  - The route itself uses the **session client**: `route.ts:73` → `const supabase = createServerSupabase();`
  - But brief generation loads data with the **service-role admin client**:
    `lib/agents/funder-research/generate-brief.ts:12` → `import { getSupabaseAdmin } from "@/lib/supabase/admin";`
  - So the reference path is **session client for logging/cap, admin client for data assembly.**
    This is the key divergence from Reed's "session-client-only" rule (§8-A).
- **`fr_agent_activity_log` writes:** four insert sites (success `route.ts:204-223`; persist-failed
  `:176-196`; tool-extraction-failure `:256-281`; api-error `:293-307`). Columns set:
  `created_by` (always `"agent"`), `triggered_by` (the admin user), `action_type` (`"research_brief"`),
  `hubspot_contact_id`, `target_id`, `target_type`, `prompt_summary`, `model_used`,
  `tokens_input`, `tokens_output`, `duration_ms`, `status` (`success|partial|failed`),
  `error_message`, `metadata` (`{ web_search_count, estimated_cost_usd, ... }`).
  Schema: `supabase/migrations/create_fr_agent_schema.sql:170-207`. This is the table
  `reed_activity_log` should generalize from (adding `org_id NOT NULL` from session, `surface`,
  `thread_id`, `cost_usd`).

## 4. getOrgContext() and the two clients

- **`getOrgContext()`** — `lib/admin/auth.ts:28-51`. Resolves the user via the session client's
  `auth.getUser()`, then reads the **first** `memberships` row for that user (`org_id, role`); returns
  `null` if no membership. Org comes from membership, RLS proves membership. This is the
  `getOrgContext()` the spec's orchestrator step (1) should reuse verbatim.
- **Session client** — `lib/supabase/server.ts:13-38`, `createServerSupabase()`, uses
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` + request cookies, **RLS applies.**
- **Service-role client** — `lib/supabase/admin.ts:10-23`, `getSupabaseAdmin()`, uses
  `SUPABASE_SERVICE_ROLE_KEY`, cached, **RLS bypassed.**
- **Service-role usage is widespread** (≈127 files across `app/` and `lib/`): public routes,
  webhooks, crons, and — relevant here — most `/admin` pages and `/api/admin` routes, plus
  `lib/admin/briefing/*` and `lib/admin/finance.ts`. **Implication:** Reed's session-client-only rule
  is genuinely novel for this codebase. The spec's mitigation (a lint/guard that fails the build if a
  Reed tool imports the admin client) is well-aimed and worth building, because the surrounding code's
  default is the opposite.

## 5. RLS idiom — verbatim (confirms the predicate, refines the draft SQL)

- **Function** — `supabase/migrations/create_bloomos_core.sql:71-84`:
  ```sql
  create or replace function private.has_permission(p_org uuid, p_perm text)
  returns boolean language sql security definer stable set search_path = ''
  as $$
    select exists (
      select 1 from public.memberships m
      join public.role_permissions rp on rp.role = m.role
      where m.user_id = auth.uid() and m.org_id = p_org and rp.permission = p_perm
    );
  $$;
  ```
  Signature is exactly `private.has_permission(p_org uuid, p_perm text)` — matches the spec.
- **Real policy, verbatim** — `create_bloomos_core.sql:103-106`:
  ```sql
  create policy "org managers update org" on orgs
    for update to authenticated
    using ( (select private.has_permission(id, 'org.manage')) )
    with check ( (select private.has_permission(id, 'org.manage')) );
  ```
- **Domain table form** (e.g. `create_fin_schema.sql`, `create_fundraising_core.sql`,
  `enable_rls_per_domain.sql`):
  ```sql
  using ( (select private.has_permission(org_id, 'finance.read')) )
  -- writes:
  using ( (select private.has_permission(org_id, 'fundraising.write')) )
  with check ( (select private.has_permission(org_id, 'fundraising.write')) )
  ```
- **Two refinements for the Appendix A draft SQL** (§8-C): real policies (a) **wrap the call in a
  `(select ...)` subquery** (Postgres initplan caching — measurable on big tables) and (b) name the
  operation + role, e.g. `for select to authenticated`. The Appendix A draft uses bare
  `using (private.has_permission(...))` with `for all`. Align the new policies to the house idiom
  before applying.
- **Roles/domains confirmed.** Domains: `org, members, program, fundraising, finance, ops, board,
  compliance, reports`. Roles: `owner, admin, staff, finance, board_viewer`. Matches the spec's
  permission-string list.

## 6. fin_reconciliation_items — Open Decision 8 resolves to "add a column"

- **No parent record carries org_id.** There is no reconciliation batch / import / session table.
  The item stands alone, deduped by `(source, source_ref)`.
- **No migration file defines the table** — it exists in the DB but isn't in `supabase/migrations/`.
  Columns are visible from the code: `id, kind, source, status, title, source_ref, detail, amount,
  payload (jsonb), evidence_url, confidence, created_by, created_at, resolved_by, resolved_at,
  applied_id` (`app/admin/finance/reconcile/_components/ReconcileInbox.tsx:6-19`;
  `app/api/admin/finance/reconciliation/route.ts:27-38`). **No `org_id`.**
- **Insert path to fix:** `app/api/admin/finance/reconciliation/route.ts:27-38` (build `row`) — this
  is where `org_id` must be set from session in the same PR as the column add. Resolution update path:
  `app/api/admin/finance/reconciliation/[id]/route.ts:64-67`.
- **Conclusion:** Open Decision 8 → **add an `org_id` column** (there is no parent to scope through).
  This is the "heaviest fix" the spec anticipated, and it confirms that branch of Appendix A.
- **Side note for Phase 1:** because there's no migration file for this table, the RLS-fix migration is
  also the first time its DDL is captured in-repo. Worth getting the column definition right there.

## 7. Briefing narrative vs the deterministic verdict line — confirmed separate

- **Narrative is AI (Sonnet), cached daily.** `lib/admin/briefing/narrate.ts:61` →
  `export const BRIEFING_MODEL = "claude-sonnet-4-6";`. One cached row/day in
  `bloomos_briefing_narrative` (`narrate.ts:10-13`), cron pre-warms ~6am. The `Narrative` type
  carries `source: "ai" | "fallback"`.
- **The verdict line ("Do one thing" / `focus`) is deterministic.** It is `briefing.top[0].title`,
  ranked by the deterministic engine `lib/admin/briefing/engine.ts:104-138` (`buildBriefing` →
  `rankItems`), with `focusLink = briefing.top[0].deepLink` (`narrate.ts:188`). The type comment is
  explicit: *"Derived deterministically from the current top item — never from the model."*
- **Rendered separately.** `app/admin/briefing/_components/NarrativeHero.tsx:69-84` renders the
  "Do one thing" box from `narrative.focus`/`focusLink`, distinct from the AI prose above it.
- **Conclusion:** the spec's boundary holds in the code. The narrative can become "Reed's morning
  read"; the verdict line is computed elsewhere and untouched. Open Decision 2 is safe to take as
  recommended (yes).

## 8. Where the code diverges from the spec — resolve before Phase 1

**A. "Session-client-only" is new, not inherited.** The reference funder agent loads its data with
the **service-role** client (`generate-brief.ts:12`), and ~127 files across the app default to the
admin client. Reed's session-client-only rule is a deliberate, stricter departure. Keep it — but
budget for it: the read-only Reed tools must be (re)written against the session client, and the
build-time guard banning the admin import in Reed code is essential, not optional.

**B. App-layer permission gating does not exist yet.** Today the funder route gates on
`isAuthed()`/`getAdminUser()` and leans on **RLS** for org/permission scoping; `has_permission` is
called only inside RLS policies (DB), never from app code. The spec wants each Reed tool "internally
gated by the matching `has_permission`." There's no app-layer helper for that yet. Pick one:
  - **(B1)** Rely on RLS via the session client — a user without `finance.read` simply gets empty
    finance reads. Simplest, matches current practice, but the tool can't cleanly say "you're not
    permitted" vs "no data."
  - **(B2)** Add a thin `await hasPermission(orgId, 'finance.read')` server helper that RPCs
    `private.has_permission`, and gate each tool on it explicitly (defense in depth on top of RLS).
    Recommended — it gives Reed a clean permission-denied path and satisfies the spec literally.

**C. Appendix A draft SQL doesn't match the house RLS idiom.** Real policies wrap the predicate in
`(select private.has_permission(...))` and declare `for <op> to authenticated`; the draft uses bare
`using (private.has_permission(...))` with `for all`. Functionally close, but align to the repo idiom
(initplan caching + explicit op/role) before applying Phase 1.

**D. Minor:** the per-org cost-cap query should filter `org_id` explicitly (§2); the existing funder
cap doesn't, and that's only safe while single-tenant.

---

## Architecture match — yes/no

**Yes, with the four caveats above.** Point by point against Appendix C's checklist:

- RLS fixed first via enable-plus-policy migrations — **matches** (idiom needs the §8-C alignment).
- One server orchestrator, contextual surfaces calling it — **matches** the funder route shape;
  reuse `getOrgContext()` (§4) and the route-level cap/log pattern (§2-3).
- Read-only, permission-gated tools on the session client — **matches in intent**, but is new to this
  codebase (§8-A) and needs a permission-gating mechanism chosen (§8-B).
- Logging to a new `reed_activity_log` generalized from `fr_agent_activity_log` — **matches**; source
  schema at `create_fr_agent_schema.sql:170-207`.
- Entitlement-gated by `has_entitlement(org_id, 'ai.reed')`, AA seeded at Bloom Flourish as data —
  **no conflict found.** No tier/entitlement/feature-flag system exists today (gating is role-based
  via `getOrgContext().role`), so the entitlement gate is greenfield and clean to add. The FAB mount
  point is `app/admin/layout.tsx:60` (`{authed && <QuickAddButton .../>}`); "Ask Reed" mounts as a
  sibling there.
- Deterministic verdict line untouched, narrative → "Reed's morning read" — **matches** (§7).

**Recommendation:** clear to proceed to Phase 1 once Remi rules on §8-B (permission-gating mechanism)
and §8-C (adopt the `(select ...)`/`to authenticated` idiom in the migration). §8-A and §8-D are
build-time guards to bake in, not blockers.
