# BloomOS — Settings "Data sources" card + HubSpot entitlement fence

Status: draft for review, 2026-07-20
Depends on: import layer live through E6 (`/admin/imports` wizard for participants + constituents; HubSpot sync runs already surface as `imports` rows with `source 'hubspot'`), entitlement reader live (`lib/admin/entitlements.ts`).
Companion docs: `specs/bloomos-core-fence.md` (classifies the `hs_*` pipeline AA-site; defines the `aa.*` flag family), `specs/bloomos-import-layer.md` (§6d connector seam — this spec is presentation + fencing on top of it, not new sync machinery), `specs/tenant-two-hardening.md`, `specs/younglife-epa-tenant-onboarding.md`.

## 1. Problem statement

The Settings page shows every tenant an Ambition Angels–specific "HubSpot sync" card. Tenant two (Kendra, Young Life EPA) sees "Never fully synced · last run partial · 2541 contacts…" — that's AA's pipeline status, rendered in her settings as if it were hers — and because `/api/admin/hubspot/sync` is gated only by `isAuthed()`, she can actually press **Sync now** and drive AA's HubSpot sync. The `aa.hubspot_mirror` entitlement key was created for exactly this fence but nothing enforces it on these surfaces. Meanwhile the thing a non-AA tenant *should* see in that spot — "here's how you get your existing CRM/spreadsheet data into Bloom" (the CSV import wizard, already built) — isn't linked from Settings at all.

## 2. Who's affected

- **Kendra (YL EPA) and every future tenant**: today they see a confusing, AA-branded sync card reporting another org's data state, with a live button into another org's pipeline. After this ships they see a "Data sources" card that speaks their language: CSV import in, recent runs, and a way to tell us which CRM they run.
- **Remi / AA**: keeps the exact HubSpot sync-now + data-age behavior, now correctly fenced as the AA-only surface the core fence already says it is.
- **Us (product signal)**: the "what CRM do you use?" prompt turns connector prioritization (import-layer spec open decision #5: build a live connector only when a tenant names their system) into collected data instead of guesswork.

## 3. Current behavior

- `app/admin/settings/page.tsx` renders `<HubspotSyncPanel />` unconditionally for every tenant.
- `app/api/admin/hubspot/sync/route.ts` (GET + POST) checks only `isAuthed()` — any authenticated member of any org can start, advance, and read AA's sync jobs.
- `app/api/admin/data-age/route.ts` likewise checks only `isAuthed()` and returns the AA spine's freshness to any tenant. (Server-side consumers — briefing gather, overview sources — import `getDataAge()` directly and are AA-surface code; the HTTP route is the cross-tenant leak.)
- `aa.hubspot_mirror` exists in the `FEATURE_KEYS` vocabulary but is referenced by no gate.
- The CSV import wizard (`/admin/imports`) is live, module-gated (`modules.program` OR `modules.fundraising`), and linked from Students and Donors — but not from Settings, and nothing on Settings tells a new tenant it exists.
- HubSpot sync runs already appear in the imports run list (`source 'hubspot'`, per-step counts) — the E6 seam works; the Settings card just predates it.
- The cron (`/api/cron/hubspot-sync`) authenticates via `CRON_SECRET` and pins `org_id` on the job — unaffected by this spec.

## 4. Desired behavior

- Settings gains one **"Data sources"** card (replacing the "HubSpot sync" card) with up to three stacked rows:
  1. **File imports — every tenant.** One line of copy ("Bring data in from your current CRM or spreadsheet — any system that exports CSV works"), a link to `/admin/imports`, and the org's most recent import runs (reuse the run-list read the imports page already does; cap at 3, RLS keeps it org-scoped for free). Hidden entirely if the org holds neither `modules.program` nor `modules.fundraising` (same gate as the wizard itself).
  2. **HubSpot — `aa.hubspot_mirror` holders only.** The existing `HubspotSyncPanel`, unchanged: sync-now, poll, data-age, partial-run details.
  3. **"Using a CRM?" — tenants *without* `aa.hubspot_mirror`.** A short prompt: live CRM sync isn't here yet, CSV covers today, and a low-friction way to tell us what they run (v1: a mailto link — see open decision #1). This is the demand-signal collector, not a promise of a connector.
- **Fence the routes.** `/api/admin/hubspot/sync` (GET + POST) and `/api/admin/data-age` require `aa.hubspot_mirror` via `requireEntitlement`, returning 402 to non-holders. `HubspotSyncPanel` is only rendered for holders, so its fetches never see the 402 in practice; its existing `.catch(() => {})` / non-ok handling degrades silently regardless.
- **AA seeded first.** The fence lands only after AA's `org_entitlements` row for `aa.hubspot_mirror` is confirmed/seeded (data, per the runbook's no-code-defaults rule) — otherwise AA locks itself out of its own sync.
- No sync machinery changes: no new connectors, no changes to the sync engine, cron, projection, or `hs_*` readers.

## 5. Scope

**In:**
- Idempotent seed for AA's `aa.hubspot_mirror` entitlement row (skip if present).
- `requireEntitlement("aa.hubspot_mirror")` on `/api/admin/hubspot/sync` (both methods) and `/api/admin/data-age`.
- The Settings "Data sources" card: imports link + recent-runs summary, entitlement-gated HubSpot row, CRM-interest prompt.
- Entitlement read happens once in the server component (`getEntitlements` is request-cached) and drives which rows render.

**Out (deliberate):**
- Any live connector (Salesforce, Bloomerang, Neon, Airtable, …). CSV is the answer until a tenant names their system; the connector seam (import-layer §6d) is where one would land, as its own spec.
- Generalizing data-age into a per-source freshness model (see open decision #2).
- Retiring `hs_*` readers, changing the sync engine, or touching the cron.
- A structured "CRM interest" table/inbox — v1 is a mailto; upgrade only if volume warrants (open decision #1).
- Gating the server-side `getDataAge()` importers (briefing, overview) — they run inside AA-surface modules already fenced elsewhere.

## 6. Architecture sketch

```
Settings page (server component)
  ├─ getOrgContext() ──► getEntitlements(orgId)        (one cached read)
  ├─ ents has modules.program|fundraising?
  │     └─ yes ► "File imports" row
  │              └─ reads imports (RLS, latest 3) ── link ► /admin/imports
  ├─ ents has aa.hubspot_mirror?
  │     ├─ yes ► <HubspotSyncPanel/>  ──► GET/POST /api/admin/hubspot/sync ─┐
  │     │                              └► GET /api/admin/data-age ─────────┤
  │     └─ no  ► "Using a CRM?" prompt (mailto demand signal)              │
  │                                                                        │
  routes: requireEntitlement("aa.hubspot_mirror") ◄──────────────────────┘
          401 unauthenticated · 402 not entitled · else current behavior

/api/cron/hubspot-sync — CRON_SECRET auth, org pinned on job — untouched.
```

## 7. Staged build order

Each a PR; seed strictly before fence.

- **S1 `chore(entitlements): seed aa.hubspot_mirror for AA`** — idempotent data seed (insert-if-absent for AA's org), verified live before S2 deploys. Commit point.
- **S2 `fix(hubspot): fence sync + data-age behind aa.hubspot_mirror`** — swap `isAuthed()` for `requireEntitlement` in both routes; confirm the panel's error paths stay silent on 402. Commit point.
- **S3 `feat(settings): data sources card`** — replace the HubSpot card with the three-row card; recent-runs read; CRM prompt copy. Commit point.

## 8. Definition of done (observable)

1. Signed in as a non-AA tenant admin: Settings shows "Data sources" with the imports row and the CRM prompt, **no** HubSpot row, no AA sync status anywhere.
2. That same session: `POST /api/admin/hubspot/sync` and `GET /api/admin/data-age` return 402; no `hs_sync_jobs` row is created.
3. Signed in as AA: the HubSpot row behaves exactly as the old card — sync-now runs, counts tick, data-age severity renders, partial-run details expand.
4. The imports row's "recent runs" for each org shows only that org's runs (existing RLS; spot-check both tenants).
5. Following the imports link lands on the working wizard; a tenant without either module entitlement sees neither the row nor the wizard.
6. Cron sync still completes on schedule after S2 (unchanged auth path).

## 9. Failure modes to watch for

- **AA fenced out of its own sync.** If S2 deploys before the S1 seed is live, "Sync now" starts returning 402 for Remi and the spine goes stale silently. Manifest: data-age drifting to `stale` with every manual sync failing. Mitigation: hard ordering (S1 verified in prod first) + DoD #3 checked immediately after S2.
- **402 rendering as a scary error.** A non-holder that somehow loads the panel (stale tab, bookmarked state) gets 402s from its fetches. The panel's current handlers swallow non-ok GETs and show "Sync failed" only after a POST — acceptable, but verify no unhandled rejection/noise; the real guard is not rendering the panel.
- **Data-age consumers regress.** The sidebar/briefing paths that read freshness must keep working for AA and must not fetch (or must ignore 402) for others. Manifest: a broken freshness chip in tenant two's chrome. Audit `fetch("/api/admin/data-age")` call sites during S2 (today: `HubspotSyncPanel` only; confirm at build time).
- **The CRM prompt over-promises.** "Tell us what you run" must not read as "connector coming soon," or tenant three onboards expecting a Salesforce sync. Copy states plainly that CSV is the supported path today.
- **Recent-runs read leaks across orgs.** It must go through the session client (RLS), never service-role — same rule the entitlement reader documents. DoD #4 covers it.

## 10. Open decisions

1. **Where the CRM interest signal lands.** Recommend v1 = `mailto:remi@ambitionangels.org` with a prefilled subject; a structured table + admin surface only if tenants actually use it. Decide at S3.
2. **Does data-age generalize?** A tenant whose spine fills via CSV has a real "how fresh is my data" question too (last committed import per entity). Worth a look once a second tenant is active daily — separate spec; this card's imports row (run dates visible) is the interim answer.
3. **Should the HubSpot card's copy mention its own retirement?** The connector framework will eventually fold sync-now into the imports surface entirely (import-layer E6+). Recommend no — users don't need the roadmap in Settings; the fence and the card regroup are enough for now.
