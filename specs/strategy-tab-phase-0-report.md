# Strategy Tab — Phase 0 Reconnaissance Report

Status: recon only. No code, migrations, or component sketches were produced. This report states facts read from the repo so the spec can be written against them. Citations are `path:line` where useful.

---

## 1. Surface inventory (section A)

### Prospecting UI
| File | Purpose |
|---|---|
| `app/admin/fundraising/prospects/page.tsx` | Prospects list. Loads the whole `hs_contacts` mirror + `fr_prospect_scores` + `fr_prospect_disqualified`; filters out disqualified; renders `ProspectsTable`. Server component, user-session client. |
| `app/admin/fundraising/prospects/_components/ProspectsTable.tsx` | Client table (shared `DataTable`) with lifecycle/owner/scored facets and bulk Copy-emails / Disqualify / Requalify. Row id = `hubspot_id`. |
| `app/admin/fundraising/prospects/[hubspot_id]/page.tsx` | Prospect detail. Loads one `hs_contacts` row (+ company, deals, engagements) and the latest brief/score; renders the brief sections, score editor, company, deals, timeline. Keyed entirely by `hubspot_id`. |
| `.../[hubspot_id]/_components/BriefPanel.tsx` | Brief container + “Run research” trigger (calls the research route). |
| `.../[hubspot_id]/_components/ScoreEditor.tsx` | 7-dimension score editor; posts to the score route. |
| `.../[hubspot_id]/_components/CompanyCard.tsx`, `DealsTable.tsx`, `EngagementTimeline.tsx` | Read-only renders of `hs_companies` / `hs_deals` / `hs_engagements` for the contact. |
| `.../[hubspot_id]/_components/BriefSections/*` (`Snapshot`, `WhatTheyCareAbout`, `HowWeFit`, `People`, `GivingProfile`, `MutualConnections`, `MeetingPlaybook`, `SourceNotesAndGaps`, `RawResearchNotes`) | One component per section of the 9-section brief `content` jsonb. |

### Prospecting API
| File | Purpose |
|---|---|
| `app/api/admin/fundraising/research/[hubspot_id]/route.ts` | **The money path.** Auth → rate-limit → monthly budget cap → run funder-research agent → insert `fr_prospect_briefs` + `fr_agent_activity_log`. User-session client. |
| `app/api/admin/prospects/[hubspot_id]/score/route.ts` | Upsert `fr_prospect_scores` keyed on `hubspot_contact_id`. Human scoring; no LLM, no cost. |
| `app/api/admin/fundraising/prospects/disqualify/route.ts` | Upsert/delete `fr_prospect_disqualified` (suppression set). Reversible; never touches the mirror. |

### Agents
| File | Purpose |
|---|---|
| `lib/agents/funder-research/client.ts` | Anthropic call, model `claude-opus-4-7`, web-search + `submit_brief` forced tool, returns metrics. |
| `lib/agents/funder-research/generate-brief.ts` | Loads agent context **exclusively from `hs_*`** (`hs_contacts` by `hubspot_id`, then company/deals/engagements); throws `CONTACT_NOT_FOUND` if no mirror row. |
| `lib/agents/funder-research/prompt.ts`, `types.ts` | System prompt + brief/result types. |
| `lib/agents/next-best-action/{agent,prompt,types}.ts` | Unrelated to prospecting — ranks open opportunities for Today’s Moves. Reads `opportunities`/`gifts`/`interactions`; keyed on `opportunity_id`. Not part of the prospecting funnel. |

---

## 2. Schema map (section B)

Read from: `create_hs_mirror_and_fr_scores.sql`, `create_fr_agent_schema.sql`, `add_archive_and_prospect_disqualify.sql`, `create_fundraising_core.sql`, `create_opportunities.sql`, `create_grants.sql`, `import_hubspot_to_constituents.sql`, `mark_hs_staging_readonly.sql`.

| Table | PK | Linking columns | FK? |
|---|---|---|---|
| `hs_contacts` | `hubspot_id` (text) | `company` (text **name**, not an id), `owner_id` (text) | none |
| `hs_companies` | `hubspot_id` (text) | `owner_id` (text) | none |
| `hs_deals` | `hubspot_id` (text) | `primary_contact_id` → `hs_contacts.hubspot_id`, `primary_company_id` → `hs_companies.hubspot_id`, `owner_id` | none (text ids only) |
| `hs_engagements` | `hubspot_id` (text) | `contact_ids text[]`, `company_ids text[]`, `deal_ids text[]` (GIN on `contact_ids`) | none |
| `fr_prospect_scores` | `id` (uuid) | `hubspot_contact_id` (text, **NOT NULL, UNIQUE**) | none |
| `fr_prospect_briefs` | `id` (uuid) | `hubspot_contact_id` (text, NOT NULL, indexed); `content` jsonb | none |
| `fr_prospect_disqualified` | `hubspot_id` (text) | `org_id` → `orgs(id)` | org_id only |
| `constituents` | `id` (uuid) | `org_id`→orgs, `household_id`→households (set null), `external_ids` jsonb (holds `hubspot` / `hubspot_company`), `tags text[]`, `archived_at` | org/household only |
| `opportunities` | `id` (uuid) | `constituent_id` → `constituents` **NOT NULL, ON DELETE CASCADE**; `external_source`/`external_id` (unique partial) | yes (constituent) |
| `grants` | `id` (uuid) | `funder_id` → `constituents` (ON DELETE SET NULL); `fund_id` → funds (set null) | yes (funder) |

### Relationship diagram

```
            HubSpot mirror (read-only staging, text ids, NO FKs)
   hs_companies ─id─┐         hs_engagements.contact_ids[] ─┐
   hs_contacts ─────┤ primary_contact_id / primary_company_id
   hs_deals ────────┘                                       │
        │ hubspot_id (text)                                 │
        │                                                   │
  fr_prospect_scores.hubspot_contact_id  ───────────────────┤  (attach to MIRROR)
  fr_prospect_briefs.hubspot_contact_id  ───────────────────┤
  fr_prospect_disqualified.hubspot_id    ───────────────────┘
        ┊
        ┊  best-effort bridge, NO FK:
        ┊  constituents.external_ids->>'hubspot' = hs_contacts.hubspot_id
        ┊  (expression index constituents_hubspot_idx; populated by importer/sync)
        ▼
   ── BloomOS spine (system of record) ──
   constituents ──< opportunities (constituent_id NOT NULL, cascade)
              └────< grants (funder_id, set null)
```

The single seam between the two worlds is `constituents.external_ids->>'hubspot'`. Everything in the prospecting funnel (scores, briefs, disqualify, the research agent) lives on the **mirror** side and is keyed by HubSpot text id. Nothing in that funnel carries a `constituent_id`.

---

## 3. Fork findings (section C)

**C1 — `hs_contacts` ↔ `constituents`.** Linked by `constituents.external_ids->>'hubspot' = hs_contacts.hubspot_id`. **Not enforced** (no FK). **Indexed** by an expression index `constituents_hubspot_idx on ((external_ids->>'hubspot')) where external_ids ? 'hubspot'` (`import_hubspot_to_constituents.sql`). **Best-effort**, populated by the one-time importer and `fr_sync_hubspot_to_spine()`. **Null on either side, frequently:** a `hs_contact` may have no constituent (never imported, or no email match), and a constituent may have no `hubspot` id (Stripe-only or manually created donors). Organizations use a parallel key `external_ids->>'hubspot_company'`.

**C2 — briefs/scores key.** Confirmed `hubspot_contact_id` for both (`fr_prospect_scores.hubspot_contact_id` UNIQUE; `fr_prospect_briefs.hubspot_contact_id` NOT NULL). `fr_prospect_disqualified` uses `hubspot_id`. **There is no `constituent_id` column on any of the three.**

**C3 — can a constituent-only funder (no mirror row) be researched or scored? No.** Trace: the research route calls `generateBriefForContact(hubspotId)`, which reads `hs_contacts` by `hubspot_id` and throws `CONTACT_NOT_FOUND` (→ 404) when absent (`generate-brief.ts:210-221`); the score route upserts `fr_prospect_scores` keyed by the `hubspot_id` URL param. Both are addressed by a HubSpot id and the agent’s context is loaded entirely from `hs_*`. A funder that exists only as a `constituents` row has no HubSpot id to address and no mirror row to read — it cannot be researched and cannot be scored today.

**C4 — grounded in migrations.** Yes; every column above is read from the `create_*`/`import_*`/`add_*` migration files, not inferred from usage.

**Attachment recommendation (one line):** attach the angle-fit to the **spine (`constituent_id`)**, not `hubspot_id` — the locked direction makes the mirror read-only/throwaway, the mirror is null for most constituent-only funders, and `opportunities`/`grants` already FK `constituents`; reach the mirror-bound briefs/scores through the existing `external_ids->>'hubspot'` bridge rather than minting a second hubspot-keyed table.

---

## 4. Strategy Room source (section D)

- Route: `app/strategy/page.tsx` → renders `app/strategy/StrategyRoom.tsx` (gated at the edge in `middleware.ts`, `noindex`).
- **Storage: hardcoded in JSX.** `StrategyRoom.tsx:32` `const angles: Angle[] = [ … ]` — a const array in a client component. The file header is explicit: “State lives entirely in component state (no storage APIs).” No DB table, no MDX, no CMS.
- Angle shape (`StrategyRoom.tsx:14`, type `Angle`):

  | Field | Meaning | Maps to prompt’s fields |
  |---|---|---|
  | `num` | "01"…"08" ordinal | — |
  | `id` | slug (`economic-mobility`) | angle id |
  | `title` / `navTitle` | display name / short nav name | name |
  | `tag` | status badge text | status badge |
  | `tone` | visual tone (`primary`/`soft`/`neutral`) | — |
  | `hook` | one-line north-star quote | north-star quote |
  | `frame`, `lead` | longer narrative | approach note |
  | `fundsLabel` + `funds` | who funds this | who-funds |
  | `want` | what they want to see | what-they-want |
  | `catch?` `{label, body}` | optional warning | approach note |
  | `ask` | ask range / model | ask range |
  | `flag?` | optional flag | — |

- The eight angles (title — badge): **01** Economic Mobility — *North Star*; **02** Place-Based Rollout — *Proven*; **03** Workforce Development and Career Pathways — *Building*; **04** K-12 Career Readiness Buildout — *Reframed*; **05** Corporate Employee Engagement — *Productizing*; **06** Youth Development — *Core thesis*; **07** Responsible AI in Education — *New and timely*; **08** Two-Generation and Parent Track — *Emerging stub*. These match the eight named in the prompt (slightly longer display names).

Implication: there is exactly **one** authored source for the angles, and it is a TS const. Seeding a `strategy_angles` table is a one-time copy from this array; alternatively, both surfaces could import one shared module. (Phase-0 decision flagged in §8.)

---

## 5. Conventions (section E)

**Nav registration.** `app/admin/_components/Sidebar.tsx`. A top-level `NAV` array of groups; the **Fundraising** group’s `items` (`Sidebar.tsx:47-57`) currently: Today’s Moves, Donors, Major Gifts, Prospects, Grants, Campaigns, Events. Each item is `{ label: string; icon: IconName; href?: string; soon?: boolean }`. `IconName` is a string-union type (`Sidebar.tsx:13`); a new tab needs a label, an existing/added icon key, and an `href`. A Strategy tab slots in as one more `items` entry in that group.

**Create flow (concrete, end to end — Opportunities).**
1. Client: `NewOpportunityForm` in `app/admin/fundraising/_components/PipelineBoard.tsx:37` — `fetch("/api/admin/opportunities", { method:"POST", body: JSON.stringify({ constituent_name: name, ... }) })`, then `router.refresh()` (`:55`).
2. Route: `app/api/admin/opportunities/route.ts` — `isAuthed()` gate → `createServerSupabase()` → match-or-create constituent → insert `opportunities` → `audit(...)` → `pushOpportunityToHubSpot(id)` → returns `{ id, warning }`.
3. Server page re-renders on `router.refresh()`.
Grants and Campaigns follow the same `New<X>Form → /api/admin/<x> → insert → router.refresh()` shape.

**RLS posture (post-0A).** Confirmed: the prospecting + spine admin routes read/write through the **user-session** client `createServerSupabase` — `research/[hubspot_id]/route.ts:73`, `prospects/[hubspot_id]/score/route.ts:81`, `prospects/disqualify/route.ts:36`, `opportunities/route.ts`, `constituents/[id]/route.ts`. **No prospecting route is on the service role.** The only service-role writer is the HubSpot sync job (writes `hs_*`); `mark_hs_staging_readonly.sql` removed member WRITE on `hs_*`, leaving members READ-only there. No flags.

**Migrations.** Location `supabase/migrations/*.sql`. Applied **by hand** (Supabase SQL editor / MCP `apply_migration`) — there is no migration runner in npm scripts and nothing applies them on merge. Files are written idempotent (`create table if not exists`, `add column if not exists`, drop-if-exists triggers) precisely because they’re re-run manually.

---

## 6. Path-to-donor bridge (section F)

**It is NOT greenfield.** `POST /api/admin/opportunities` already promotes free text into the spine: given `constituent_name`, it matches an existing constituent case-insensitively (`org_name`, or `first/last`); one match links it; multiple links the first and returns a `warning`; **no match inserts a new `person` constituent (`source:'manual'`)** and warns to add details (`opportunities/route.ts`, the `if (!constituentId)` block). The Grants funder flow mirrors this.

**What’s missing (the real gap):**
- No “create a `constituents` row from a specific `hs_contacts` prospect on demand.” The only mirror→spine path is the **bulk** `import_hubspot_to_constituents.sql` / `fr_sync_hubspot_to_spine()`; there is no per-prospect “promote this one now” action from the prospect detail page.
- No “create opportunity/grant directly from a prospect” button — the opportunity form is name-based, not wired from a `hs_contact`/prospect row.
- The Strategy funnel itself — shortlist, triage gate, angle tag/lens, go/no-go state — is entirely greenfield (no table, route, or column exists for any of it; `opportunities`/`grants` have **no angle/tag column**, though `constituents.tags text[]` exists).

---

## 7. Budget guardrails (section G)

Cap lives **inline in `app/api/admin/fundraising/research/[hubspot_id]/route.ts`** (not `lib/admin/finance.ts`). Constants at the top of that file:
- `MONTHLY_BUDGET_HARD_USD = 20` → **402** when month-to-date estimated spend ≥ $20.
- `MONTHLY_BUDGET_WARN_USD = 12` → returns a `budgetWarning` string in the success payload (not a status code).
- `RATE_LIMIT_MAX = 5` per `RATE_LIMIT_WINDOW_MS = 10 min` per triggering user → **429**.
- Per-run cost is **estimated, not metered**: `estimateCostUsd()` using Opus rates `OPUS_INPUT_PER_MILLION_USD = 15` / `OPUS_OUTPUT_PER_MILLION_USD = 75`, summed over the month from `fr_agent_activity_log.tokens_input/output`.

Response codes the UI keys off: **429** rate limit, **402** budget exceeded, **404** `CONTACT_NOT_FOUND`, **502** agent/extraction/persist failure (`AgentResultError` → 502), **401** unauth. The score route has no budget (human action).

---

## 8. Open decisions for the spec

Each: the call, my recommendation, and the one fact that drives it.

1. **Where the angle-fit join attaches.** → **Spine (`constituent_id`)**, reaching mirror-bound briefs/scores via `external_ids->>'hubspot'`; do not add a hubspot-keyed angle table. *Driving fact:* locked direction makes `hs_*` read-only/throwaway and it is null for most constituent-only funders, while `opportunities`/`grants` already FK `constituents`.

2. **Does the Strategy tab list funders from the mirror or the spine?** → **Spine (`constituents`)**, with a transition bridge to today’s mirror-bound research/scoring. *Driving fact:* a constituent-only funder cannot exist in the mirror, and §3-C3 shows research/score are mirror-bound — so a spine-first list needs a defined bridge, not a swap.

3. **Seeding source for the eight angles.** → Extract the `angles` array out of `StrategyRoom.tsx` into one shared source both surfaces read; seed a `strategy_angles` table from it only if the internal tab needs editable per-angle status/metadata. *Driving fact:* the angles are a single hardcoded TS const today — there is no second source to reconcile.

4. **Is the promote-to-donor bridge greenfield?** → **No** for name→constituent (reuse the existing `/api/admin/opportunities` match-or-create); **yes** for prospect(`hs_contact`)→constituent and for the shortlist/triage/go-no-go machinery. *Driving fact:* the per-prospect mirror→spine promotion and the entire angle funnel have no table/route/column today.

### Adjacent facts the spec will want
- `opportunities` and `grants` have **no angle/tag column**; `constituents` already has `tags text[]`. An angle-as-tag could ride `constituents.tags`, but carrying the angle onto an opportunity/grant would need a new column or join.
- Briefs/scores/disqualify are all keyed to the **mirror**; any spine-first model must either backfill `constituent_id` onto them or always resolve through the bridge.
- The research agent reads **only** `hs_*`; researching a spine-only funder would require either a synthetic mirror row or teaching the agent to read the spine — a real scope item, not a tweak.

---

*End of Phase 0 report. No application code, migrations, or component designs were produced. Awaiting review before Phase 1 (spec).*
