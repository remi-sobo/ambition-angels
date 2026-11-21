# V4 audit harness: BloomOS on a mock Supabase with made-up data

1. Write `.env.local` (delete it after): `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321` plus JWT-shaped strings for `NEXT_PUBLIC_SUPABASE_ANON_KEY` (payload `role: "anon"`) and `SUPABASE_SERVICE_ROLE_KEY`. Leave every other service key unset.
2. Start the mock: `node e2e/v4/mock-supabase.mjs` (env `V4_PROFILE=populated|empty`, `V4_ROLE=owner|admin|staff|finance|board_viewer`, `V4_PERSIST=1` to keep writes, `V4_DELAY_MS`). Switch live with `POST /__mock/config {profile, role, delayMs, delayPattern, failRead, failWrite}`.
3. Start the app: `npm run dev` (port 3000).
4. Capture: `node e2e/v4/capture.mjs --run <name> --set all|nav|details|orphans --viewports desktop,phone [--role staff] [--profile empty] [--only <substr>] --out <dir>`. Writes JPEGs plus `manifest.json` (status, final URL, redirects, console/page errors, failed requests, error boundary, 404, module gate, h1, load time).
5. Special states (sheets, search, Reed, task modal, loading, failed saves, 500 reads): `node e2e/v4/special-states.mjs --run special --out <dir>`. All standard runs: `V4_SHOTS=<dir> bash e2e/v4/run-all.sh`.
6. Review fast: `node e2e/v4/contact-sheet.mjs <dir>/<run> [--viewport phone]` tiles shots into `sheets/`.
7. Coverage: the mock writes `e2e/v4/.logs/no-fixture-<profile>.json` (tables/RPCs requested with no rows), `coverage-<profile>.json` (selects seen, filters ignored) and `writes.jsonl` (every write body).
8. Fixtures: `fixtures/index.mjs` generates one invented org, "Ambition Angels (demo)" (deterministic, dates relative to now). Column sets, FKs and enums come from `fixtures/schema.json` etc., rebuilt from the migrations by `bash e2e/v4/dump-schema.sh` (throwaway local Postgres on /tmp/v4pg, never production).
9. SQL views (`v_obligations`, `v_action_items`, `v_revenue_schedule`, `v_fr_rollups`, ...) are computed by loading the fixtures into that Postgres: `node e2e/v4/fixtures/compute-views.mjs` writes `fixtures/views.json`. Re-run it on the day you capture.
10. Limits: no RLS, no triggers, no realtime, no storage; every role sees every row. Treat role "leaks" as app-layer checks only. Stop the mock and dev server and delete `.env.local` when done.

## Stage P: pilot checks (smoke flows, two orgs, roles, accessibility, visual)

One runner starts the mock and the app (unless already up) and runs a suite. It refuses to start the app while a `.env.local` exists, so real keys never reach a test run; it passes the mock URL and JWT-shaped keys as environment variables instead.

| Command | What it does | Output (in `e2e/v4/.logs/`) |
|---|---|---|
| `npm run e2e:smoke` | The six Section 9 workflows (`smoke/workflows.spec.ts`), two orgs x owner, staff, board viewer, at 1440 and 390, with click/tap counts asserted against the targets | `smoke-results.jsonl`; `node e2e/v4/smoke/report.mjs smoke` → `smoke-summary.md` |
| `npm run e2e:roles` | Every route in `lib/admin/adminRoutes.generated.ts`, two orgs x owner, staff, finance, board viewer (`smoke/routes.spec.ts`) | `roles-<org>-<role>.json`, `roles-table.md` |
| `npm run e2e:a11y` | axe-core (WCAG 2.2 AA tags) on every route at 1440 and 390 as owner, plus a keyboard pass on Pipeline and menus (`smoke/a11y.spec.ts`) | `a11y-<viewport>.json`, `a11y-summary.md` |
| `npm run e2e:visual` | First-screen shots of every nav destination for owner, staff, finance and board viewer, populated and empty, desktop and phone, diffed against `e2e/v4/baseline/` (`visual.mjs`) | `out/visual/diff.md`, full-size JPEGs in `out/visual/<role>-<profile>/` |

`V4_SERVER=start npm run e2e:roles` builds once and serves the production build; the route-wide suites are several times faster that way. Ports: `V4_APP_PORT` (3032) and `V4_MOCK_PORT` (55352). Traces are off; pass `--trace on` after the suite name to keep them.

**Two orgs.** With `V4_TWO_ORG=1` (the runner sets it) the mock holds the demo org and "Lanternfield Youth Alliance (demo)" (`buildTwoOrgFixtures`), a copy with its own ids, its own invented surnames, foundations, companies and team, and the Pilot plan (no Ambition Angels-only modules). `POST /__mock/config {org: "a"|"b", role}` signs in as that org's first team member. Reads made with a user's JWT see only that user's orgs (a rough RLS); service-role reads see both orgs, as in production, so a service-role page that forgets its org filter shows the other org's names. `CANARIES` in the fixtures lists the strings that belong to one org only.

**Updating the visual baseline.** Run `npm run e2e:visual`, read `out/visual/diff.md` and look at each listed shot in `out/visual/<run>/`. When every difference is intended, run `npm run e2e:visual -- --update` and commit `e2e/v4/baseline/` with a line in the PR saying what changed and why. The baseline is 200px-wide JPEG thumbnails of the first screen, so it stays small; a shot fails when more than 1.5% of its pixels move by more than 40 grey levels, or its height changes by more than 10%. Fixture dates are relative to today, so compare runs made on the same day as the baseline where you can; a greeting that changes with the hour is a known small diff.
