# 03 — Technical Architecture

Stack philosophy: **boring, consolidated, already-paid-for.** Next.js 14+ (App Router) on Vercel, Supabase (Postgres + Auth + Storage + Realtime), Anthropic API. Every decision below was researched against alternatives in June 2026; rationale and the losing options are recorded so future-us doesn't relitigate blind.

## 1. Decision summary

| Concern | Decision | Beat out | Why (condensed) |
|---|---|---|---|
| Auth | **Supabase Auth** (`@supabase/ssr`) | Clerk, Better Auth, Auth.js, WorkOS | $0 marginal on existing stack; free TOTP MFA; magic links; native `auth.uid()` → RLS with zero glue; SAML later at $0.015/SSO-MAU (no per-connection fee). Auth.js is in security-patch-only mode (absorbed by Better Auth, Sept 2025) — banned for new code. Clerk = best org UI but adds vendor, TP-MAU fees, 10-custom-role cap |
| Multi-tenancy | **Shared tables + `org_id` + RLS** | schema-per-tenant, project-per-tenant | Supabase's own recommendation at this scale; one migration path; Basejump-style membership tables as blueprint |
| RBAC | **DB-native:** `memberships.role` + `role_permissions(role, permission)` table; code checks permissions, never role names | Permit.io/Cerbos/Oso, CASL | ~100 lines + one SQL function; new roles are data inserts; authz services can't enforce inside RLS, our strongest layer |
| Background jobs | **Inngest** | Trigger.dev, QStash, Vercel Cron/Workflows, pg_cron+Edge Functions | Durable steps + retries + cron + concurrency keys, living in the Next.js repo, zero extra deploy surface; free tier (~50K step-executions/mo) covers our volume ~10x; Vercel Cron has **no retries**; Vercel Workflows/Queues still beta — re-evaluate at GA |
| Integrations | **Hand-rolled** per provider; shared webhook-ingestion + `connections` token store | Merge ($650/mo), Nango, Paragon, Apideck | 3–5 fixed providers; Givebutter = static API key, HubSpot = private-app token; only QBO OAuth is hard (see §5) |
| File storage | **Supabase Storage**, private buckets, `{org_id}/...` path prefix + RLS on `storage.objects` | Vercel Blob (private = beta), S3, R2 | One authorization model for rows AND files; Pro plan includes 100GB; short-TTL signed URLs (60–300s) |
| E-signature | **Built-in clickwrap** (default) + **SignWell API** ($0.75/doc PAYG) for formal ceremonies | DocuSign ($50+/mo), Dropbox Sign | Clickwrap + audit trail is ESIGN/UETA-valid; SignWell is SOC 2 Type II with 25 free docs/mo; DocuSign is 2–6x cost for zero added validity |
| Email | **Resend** (already integrated) + React Email; Postmark hedge for legally-significant sends if deliverability degrades | SES, Loops, Customer.io | Free→$20/mo covers volume; React Email fits the codebase; make sends idempotent + queue-backed (Resend has outage history) |
| In-app notifications | **Own `notifications` table + Supabase Realtime broadcast** | Knock ($250/mo), Novu | One table + one trigger ≈ free; defer orchestration vendors until multi-channel preference centers actually needed |
| Charts | **shadcn/ui charts (Recharts v3)**; ECharts escape hatch for exotic/huge charts | Tremor, visx, Nivo | Copy-owned code (Tremor's post-acquisition limbo is the cautionary tale); maps to our Tailwind tokens (`--chart-N`) |
| Configurable dashboards | **react-grid-layout v2** + JSONB layout per user/org + **code-defined metric registry** | Metabase embed ($575/mo+), Lightdash | Metric registry doubles as the AI agent's whitelisted query surface — one semantic layer for humans and agents |
| LLM | **Anthropic**: Sonnet 4.6 default, Haiku 4.5 routed for cheap tasks, Opus 4.8 for heavyweight analysis | — | See §6. Current pricing: Haiku $1/$5, Sonnet $3/$15, Opus $5/$25 per MTok |
| LLM observability | **Langfuse** (self-host or $29/mo Core) | Helicone | Helicone acquired by Mintlify, maintenance mode (Mar 2026) — do not build on it |
| Vector/RAG | **pgvector** (HNSW, halfvec) + Postgres FTS, Reciprocal Rank Fusion; Supabase automatic-embeddings pipeline (pgmq + pg_cron + Edge Function) | dedicated vector DBs | Org-scale corpora are tiny; pgvector 0.8 iterative scans fixed the org_id-filtered-query problem |
| Embeddings | **OpenAI text-embedding-3-small** ($0.02/MTok) or voyage-3.5-lite (same price; MongoDB-owned now) | — | Cost is noise at our scale; OpenAI is the safer dependency |

## 2. Multi-tenancy & RLS (the foundation)

```sql
create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create type org_role as enum ('owner','admin','staff','finance','board_viewer');

create table memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id  uuid not null references orgs(id) on delete cascade,
  role    org_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index on memberships (user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role org_role not null,
  token text unique not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now()   -- 7-day expiry enforced in policy
);

-- Private schema, NOT exposed via PostgREST. SECURITY DEFINER breaks the
-- RLS-recursion cycle on memberships and is the documented fast path.
create schema private;
create function private.is_org_member(p_org uuid) returns boolean
language sql security definer stable as $$
  select exists (select 1 from memberships
                 where user_id = auth.uid() and org_id = p_org);
$$;
create function private.has_permission(p_org uuid, p_perm text) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships m
    join role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid() and m.org_id = p_org and rp.permission = p_perm);
$$;

create table role_permissions (role org_role not null, permission text not null,
  primary key (role, permission));
-- e.g. ('finance','finance.read'), ('board_viewer','reports.read'), ('staff','program.write') ...
```

**Binding RLS rules** (from Supabase's official perf guidance — these are 100x-class differences):

1. Every tenant table: `org_id uuid not null references orgs(id)` + **btree index on `org_id`**.
2. Policies wrap function calls in SELECT for initPlan caching: `using ( (select private.is_org_member(org_id)) )`. Writes get `with check` too.
3. Always `to authenticated` on policies. Queries still pass explicit `.eq('org_id', ...)` — RLS is the guarantee, not the query plan.
4. **No JWT org-claims initially** (staleness + multi-org users); membership lookup via the definer functions is fast enough. Custom access-token hook is a later optimization if EXPLAIN says so.
5. Run Supabase Performance/Security Advisors in CI (`get_advisors` via MCP) — lints unwrapped policies and missing indexes.

**Service-role discipline:** route handlers and server actions use the **user-JWT client** (`createServerClient` from `@supabase/ssr`) so RLS always applies. A separate, explicitly-named `createAdminClient()` is allowed only in: webhook ingestion, Inngest jobs, invitation acceptance — and those paths must derive `org_id` server-side (never from request input) and carry integration tests asserting cross-tenant reads return zero rows.

**Next.js enforcement layers** (CVE-2025-29927 lesson — middleware was bypassable):
1. Middleware: session refresh + redirect UX only. Pin Next ≥ 14.2.25.
2. Every server action / route handler: `getUser()` + permission check before mutating (and before non-DB side effects RLS can't protect — email, Stripe).
3. RLS: the floor that survives bugs in layers 1–2.

**Migration path from today:** create org tables → seed Ambition Angels org → add `org_id` (default = AA org) to every existing table → enable RLS table-by-table → swap service-role reads for user-JWT reads route-by-route.

## 3. Auth specifics

- Email+password with **TOTP MFA required for owner/admin roles**; magic-link login for `board_viewer` (research: volunteer-director adoption dies on hard logins — month one is the whole game).
- Supabase third-party SMTP (Resend) for auth emails (default SMTP is rate-limited to ~2–4/hr).
- Server code uses `getUser()` / `getClaims()` (never `getSession()` trust) per Supabase SSR guidance.
- SAML (district/enterprise customers) deferred to Ring 4+; available on the Pro plan when needed.

## 4. Background jobs (Inngest)

Workload classes and their shapes:

| Class | Pattern |
|---|---|
| Provider syncs (QBO, Givebutter, HubSpot-import) | cron trigger → per-step fetch/upsert with concurrency keys tuned to provider rate limits (QBO: 500 req/min/realm; webhook follow-up reads batched) |
| Webhook processing | webhook route verifies + persists + returns 202 → emits Inngest event → processor with retries; exhausted retries → DLQ row + notification |
| Digests & briefings | cron → fan-out per user → render React Email → Resend batch |
| AI agent runs | step-decomposed (one LLM call per step) — each step stays under Vercel's 800s Pro cap; multi-minute runs fine |
| Housekeeping | pg_cron stays for in-database work only (partition rotation, soft-delete purge, embedding queue) |

Vercel Cron is allowed only for trivial pings; it has **no retries** and silent-failure semantics. Existing `app/api/cron/meet-reminders` migrates to Inngest in Ring 1.

## 5. Integrations layer

**Connections (OAuth/API-key store):**

```sql
create table connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  provider text not null,              -- 'quickbooks' | 'givebutter' | 'google' | 'gusto' | 'hubspot'
  external_id text,                    -- e.g. QBO realmId
  access_token_enc bytea,              -- AES-256-GCM, app-layer, key in env/KMS
  refresh_token_enc bytea,
  expires_at timestamptz,
  status text not null default 'active',
  meta jsonb not null default '{}',
  unique (org_id, provider, external_id)
);
-- RLS: deny all to authenticated; service paths only.
```

**QuickBooks token rules (the one hard OAuth):** access token 1h; refresh token *rotates roughly daily* — persist the returned refresh token immediately every time, wrap refresh in a Postgres advisory lock (single-flight) so concurrent jobs can't orphan the chain, refresh proactively at ~50min inside one scheduled job, and run a **daily keep-alive** so the inactivity window never bites. Build re-connect UX for dead connections. (Intuit announced a refresh-policy change Nov 2025 — verify current rotation behavior at build time.) Gusto refresh tokens are also single-use rotated; same discipline.

**Webhook ingestion (uniform pattern, all providers):**

```sql
create table webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  external_event_id text not null,
  topic text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending',   -- pending | processed | failed | dead
  processed_at timestamptz,
  unique (provider, external_event_id)       -- atomic dedupe; ON CONFLICT DO NOTHING
);
```

1. Verify signature on the **raw body** (HubSpot v3: HMAC over method+uri+body+timestamp, reject >5min; QBO: `intuit-signature` HMAC w/ verifier token; Givebutter: per-webhook signing secret).
2. Insert with conflict-ignore; **return 2xx in <5s** (HubSpot's timeout is the binding constraint).
3. Emit Inngest event; processor fetches full entities where payloads are thin (QBO sends IDs only).
4. **Webhooks are pokes, not truth:** nightly reconciliation sync per provider (Givebutter events don't fire for CSV imports; QBO delivery is best-effort with 5–25min latency). QBO incremental sync uses CDC (`changedSince`, 30-day lookback) — and reads are metered (500K free CorePlus credits/mo), so sync is CDC + cached reports, never naive polling.

## 6. AI architecture

**Models & cost controls:**
- Routing: Haiku 4.5 (classification, extraction, short summaries) → Sonnet 4.6 (agent workhorse, briefings) → Opus 4.8 (rare heavyweight analysis). Don't switch models mid-conversation (cache loss).
- **Prompt caching:** stable system prompt + tool defs before the cache breakpoint (reads ≈ 0.1x price). Never put org data in a shared cacheable prefix.
- **Batch API (50% off)** for nightly jobs: donor-brief pregeneration, digest drafting, bulk classification.
- **Structured outputs are GA:** `output_config.format` + `client.messages.parse()` with `zodOutputFormat`; `strict: true` on tools for guaranteed-valid params. Prefill-based JSON is dead (400s on 4.6+). Migrate `career-quiz` and `funder-research` accordingly.
- **Per-org metering:** `ai_usage(org_id, day, model, input_tokens, output_tokens, cache_read, cost)` written from every response's `usage`; soft-warn 80% / hard-stop 100% of monthly budget. Langfuse traces tagged with org_id.

**Agent safety (binding rules):**
1. **Narrow, typed tools — never raw SQL writes.** Reads go through the **metric registry** (same registry that powers dashboards) or scoped RPCs.
2. Agent tool handlers execute with the **calling user's JWT client** → RLS caps blast radius even under prompt injection.
3. **Draft-then-approve:** mutations land in `pending_actions(org_id, tool, payload, rationale, proposed_by, status, approved_by)`; humans approve in UI; a worker applies. Low-risk reversible writes (add a note/tag) may be allow-listed; sends/deletes/financial edits never.
4. Retrieved org content is wrapped in delimiter tags with a system instruction that it is data, not instructions (indirect prompt-injection is OWASP LLM #1; donor notes and imported CSVs are untrusted input).
5. Append-only `agent_actions` audit log: tool, input, result, model, request-id, approver.
6. **Data protection:** Anthropic commercial terms = no training on our data; pursue Zero-Data-Retention agreement before minors' data flows through prompts; pseudonymize participants in prompts (IDs, not names) wherever output quality allows.

**RAG:** per-record "cards" (one record = one chunk, templated natural language, 256–512 tokens) for structured entities; fixed-size chunks for long free text. `embeddings` table carries `org_id` + same RLS as sources; hybrid search is a single SQL function `hybrid_search(query, embedding, org_id, k)` with RRF. For aggregates ("top 10 donors this quarter"), **SQL-via-metric-registry beats RAG** — the agent picks metrics + params; it does not write SQL.

**UI layer:** Vercel AI SDK (v5+) with `@ai-sdk/anthropic` for chat/streaming/tool-render/HITL approval states; raw Anthropic SDK for server-side batch + newest features. Model IDs + system prompts in one shared config module.

## 7. Reporting framework

- **Metric registry** (code-defined): `metric_key → { sql_or_rpc, dimensions, grains, format, permission }`. One parameterized API route executes registry entries under the caller's RLS. Dashboards, saved reports, scheduled exports, and agent tools all run through it.
- Dashboard configs: `dashboards(org_id, user_id nullable, layout jsonb, widgets jsonb, version)` — org default + per-user override; Zod-validated; react-grid-layout `onLayoutChange` debounce-saved.
- Funder/board outputs are **renderers over the registry**: board packet PDF, funder report, 990-mapped annual view (modules/04, /05, /07).

## 8. Environments & ops

- Vercel Pro + Supabase Pro ($25/mo; daily backups 7-day). **Nightly `pg_dump` via GitHub Actions to off-platform storage** (R2/S3) — covers >7-day retention + provider-independent escrow; Storage files backed up separately (DB backups exclude them). Quarterly restore test, one-page runbook. PITR (+$100/mo, RPO ~2min) when paying customers exist.
- Supabase branches/preview for migrations; migrations in-repo (already the pattern — keep `lib/database.types.ts` generated, not hand-written, going forward: `generate_typescript_types`).
- Sentry (or equivalent) for errors; Inngest dashboard for job observability; Langfuse for AI.
