# Spec B — the V2 shell

Navigation, entitlements, terminology, redirects, mobile. No destination screens.
Date: 2026-09-03 · Depends on: `docs/v2-recon.md`, `docs/v2-preservation-ledger.md`. Independent of Spec A.

---

## Problem statement

V1 is 26 sidebar rows across seven groups, with five surfaces answering "what needs me" (Overview cockpit, Inbox, Executive Briefing, the action queue, and the right rail), two stacked rows of secondary navigation, and 11px uppercase labels as the default. The product reads dense before it reads calm, and a user picks a door before starting work.

The deeper problem is multi-tenant. The nav model already reads entitlements, but it was built when there was one tenant. There are four now, holding 27, 18, 9, and 9 feature keys. V2's route map is written as a fixed seven destinations with fixed tab rows, which works for Ambition Angels and breaks for the other three.

## Who's affected

All four orgs, differently, which is the point. Remi and Shannon see the full 27-key layout. Young Life EPA and SafeSpace hold 9 keys each and, under the locked map as written, land Organization on Strategy, which they aren't entitled to. Young, Gifted & Black at 18 keys sees AA's layout minus every `aa.*` surface.

## Current behavior

Grounded in the recon. `lib/admin/nav.ts` holds `NAV_SECTIONS`, the single IA model rendering both the sidebar (`_components/Sidebar.tsx`) and the sub-topic bar (`SectionSubNav.tsx`). Every `NavItem` and `SectionTab` can carry `feature?: FeatureKey`, filtered through `visibleSections(features)`; `term?: string`, resolved via `itemLabel()` against `org_terminology` with an `entity_types.display_name` fallback; and `match?: string[]`, longest-prefix route ownership. `getEntitlements(orgId)` is request-cached on the session client so RLS scopes it, unknown keys are OFF, and the `FEATURE_KEYS` union makes a typo a compile error.

`resolveSectionNav()` builds up to two stacked pill rows. Two mapping quirks: the Career Library item is gated on `aa.quiz` rather than a content key, and Volunteers is gated on `modules.fundraising` because its route sits under `/admin/fundraising/volunteers`.

Live `org_terminology` has 13 rows. Young Life EPA overrides cohort to Group, student to Kid, volunteer to Leader, partner to School, board to Committee. YGB overrides student to Scholar, cohort to Crew, volunteer to Mentor. SafeSpace overrides student to Youth. Ambition Angels has zero rows, so its words are the defaults.

## Desired behavior

Seven destinations, one secondary row, no third level. A destination lands on its first entitled tab and disappears when it has none. Tab labels read the tenant's own words. Every V1 route redirects rather than disappears.

## Scope

**In.** The nav registry rewrite, the first-entitled-tab rule, terminology resolution on tab labels, the sidebar, the single tab row, the page header pattern, the Reed launcher, mobile top and bottom bars and the drawer, the redirect map, the `(v2)` route group and its flag, and the report-an-issue trigger placement.

**Out.** Every destination screen. Contracts 2, 3, and 7 (Spec A). Saved views. The Reed panel's contents. Search results. Onboarding.

---

## Architecture

### The nav registry stays code, filtered by data

Destinations and tabs remain in `lib/admin/nav.ts`, not rows in a table. The seven destinations are product structure under a locked route map; making them tenant-editable would let a tenant invent an eighth and break the contract. Visibility and labels are data: `org_entitlements` decides what renders, `org_terminology` decides what it's called.

### The first-entitled-tab rule

The single most important thing in this spec, and it must exist before any screen is built.

A destination's `lands` property becomes a computed value, not a constant. Resolve the tab list against entitlements, take the first survivor, and route there. A destination whose tab list resolves empty is removed from the sidebar entirely.

Concretely today: Organization lands on Board rather than Strategy for Young Life EPA and SafeSpace, and Team disappears for both. Work loses My Week and Meetings for them. Impact keeps KPIs, Outcomes, and Reports but drops Analytics, which is `aa.*` keyed. Programs drops Content. Inbox drops the Messages tab. No org currently resolves a destination to zero tabs, but the rule handles it because the fifth tenant will.

The URL always names the resolved tab, never the destination alone, so a shared link is unambiguous across tenants.

### Terminology on tab labels

Tab labels resolve `cohort`, `partner`, `student`, `board`, and `staff` through the existing `itemLabel()` path. The Handoff Spec's tab named "Cohorts" is Ambition Angels' default for term-key `cohort`; Young Life EPA's row must read "Groups." Resolution order is `org_terminology`, then `entity_types.display_name`, then the built-in default. No new mechanism, and the seven-key vocabulary already covers it.

### Tab row width is a per-tenant variable

Falls out of the two rules above and constrains design decisions. Fundraising has five tabs for AA and five for SafeSpace; Work has six for AA and four for the 9-key orgs. Any layout assuming a fixed tab count breaks silently on a tenant nobody tested. This is why prospect research is a drawer rather than a sixth Fundraising tab: a tab present for two of four orgs makes the row a different width per tenant.

### Redirects are 308s, permanent, and shipped first

Every V1 route in the Stage 0 map gets a server-side permanent redirect in `next.config.mjs` or middleware. Client-side rewrites are insufficient because `notifications.url` holds relative `/admin/...` paths written by `lib/notifications/notify.ts`, and those rows persist forever. Same for `ops_tasks.linked_entity_*` resolved through `lib/admin/entities.ts`, briefing deep links, and every operator email already sitting in an inbox.

`lib/admin/actionQueue.ts` holds the central source-to-route table for queue deep links. Updating that one map moves every obligation link at once, so it is the single choke point rather than 137 scattered link constructions.

Redirects ship in B2, before any destination cuts over, and are never removed.

### The route group and the flag

V2 mounts at `app/admin/(v2)/` behind a per-user flag. V1 stays live. Destinations cut over one at a time by flipping a sidebar row from its V1 route to its V2 screen; unmigrated destinations render their existing V1 pages inside the V2 shell, with the tab row falling back to the V1 secondary nav for that destination only. Nothing is deleted at any point.

### Report an issue

Shell-level and destination-independent, per the preservation gate. The trigger lives in Quick Add and in the mobile More sheet. `ReportModal` carries forward whole: the guided interview, voice and photo, the Claude Code prompt synthesis, the `bloomos-reports` bucket, the operator email, and filing into the "BloomOS Upgrades" project with the `claude-prompt` label. One addition: `origin_path` captured as a structured field.

### Reed

Collapsed to a right-edge tab by default, expanding to a 340px espresso panel. `showReed` gates availability and must also check the `ai.reed` entitlement, which Young Life EPA and SafeSpace lack. Hidden below 1280px; the launcher hidden below 1024px so it cannot collide with the mobile bar. Page padding carries a right gutter of 52px on desktop to clear it.

### Mobile

Below 1024px the sidebar becomes a drawer. Bottom bar is Today, Work, plus, Programs, More, with 52px targets. More holds Fundraising, Finance, Impact, Organization, Inbox, Settings, and Reed, **filtered by entitlement like everything else**. Mobile scope is field action: attendance, capture, task completion, logging an interaction, approvals, lookup, the day. Not finance tables, not the pipeline board.

---

## Staged build order

**B1 — the nav model.** Rewrite `NAV_SECTIONS` to seven destinations with one tab row. Implement first-entitled-tab resolution and zero-tab hiding. Fix the two V1 gating quirks: Career Library moves off `aa.quiz` to its own content key, Volunteers stops being gated on `modules.fundraising`. No rendering changes yet; the model is testable on its own. Commit: `spec-b: seven-destination nav model with entitlement resolution`.

> **As built (accepted, Remi, 2026-09-03).** The kickoff's "rewrite `NAV_SECTIONS`" and "no rendering changes" cannot both hold while V1's sidebar renders that constant directly, so the V2 model landed as **parallel exports** (`V2_DESTINATIONS`, `V2_INBOX`, `resolveV2Destination()`, `resolveV2Nav()`) alongside an untouched `NAV_SECTIONS`. This preserves DoD 8 and lets B3 swap the consumer rather than the model. The obligation that comes with it is the named cleanup below.

### Named cleanup: delete `NAV_SECTIONS` when V1 retires

The parallel model means the project carries **two navigation models** from B1 until the last destination spec cuts its screens over. That state is temporary by contract: when V1 retires, `NAV_SECTIONS` (and `visibleSections()`, and every V1-only consumer) must be **deleted**, not left as a second source of truth — two live nav models drift. This cleanup is owed at the end of the destination specs and is not done until the delete lands.

The two B1 gating fixes (Career Library → `modules.content`, Volunteers → `modules.program`) were applied to the doomed model **on purpose**: V1 is what users see until B3+, so its gates had to be corrected in place even though the model they live in is scheduled for deletion.

**B2 — the redirect map.** All 42 Stage 0 rows as 308s, plus the two deep-link choke points: `lib/admin/actionQueue.ts`'s source-to-route table and `lib/admin/entities.ts`'s entity-URL resolver. Ships before any screen moves. Both #453 and #458 merged (with #458 retargeted to `main`) is a precondition, so the redirect work is not a third-level stack — but the stage begins only when Remi pastes the kickoff, never because the precondition cleared. Reference copy in the appendix. Commit: `spec-b: permanent redirects for all V1 routes`.

**B3 — the shell.** Sidebar, single tab row, page header, Reed launcher, the `(v2)` route group and flag. V1 pages render inside it. Commit: `spec-b: V2 shell with V1 pages hosted`.

**B4 — terminology.** Tab labels and sidebar rows resolve through `itemLabel()`. Commit: `spec-b: tenant terminology on nav labels`.

**B5 — mobile.** Drawer, top bar, bottom bar, More sheet with entitlement filtering. Commit: `spec-b: mobile shell`.

**B6 — Quick Add and report an issue.** Quick Add sheet, search overlay trigger, the report modal rehomed with `origin_path`. Commit: `spec-b: quick add and issue reporting in the shell`.

---

## Definition of done

1. Signed in as each of the four orgs, the sidebar shows only entitled destinations and each lands on its first entitled tab. Organization lands on Board for Young Life EPA and SafeSpace, on Strategy for AA and YGB.
2. Young Life EPA's Programs tab reads "Groups," YGB's reads "Crews," AA's reads "Cohorts," from the same code path.
3. Every route in the Stage 0 map returns a 308 to its V2 home. Verified by test, not by hand.
4. A `notifications.url` row written in June resolves to the correct V2 screen.
5. Report an issue works from Quick Add and mobile More, files into "BloomOS Upgrades" with the `claude-prompt` label, and carries `origin_path`.
6. Reed's launcher is absent for orgs without `ai.reed`.
7. The tab row never wraps or stacks at any tenant's tab count, verified at 1024px and 1280px for all four orgs.
8. With the flag off, V1 is byte-for-byte unchanged.

## Failure modes

**A destination resolves to zero tabs for a tenant nobody tested.** The rule handles it by hiding the destination, but a user who bookmarked it gets a dead route. The redirect layer must send an unentitled route to that tenant's Home rather than a 404.

**Terminology missing for an org.** AA has zero `org_terminology` rows by design. The fallback chain must be exercised in tests, not assumed.

**Redirect loops** between a V1 route and a V2 route that redirects back while its destination is unmigrated. B2 shipping before B3 is what prevents this; verify with an automated crawl.

**The flag leaks.** A user with the flag on and a colleague with it off see different navigation and share links that resolve differently. Acceptable during rollout, but the redirect map must work identically under both.

## Open decisions

1. **Flag granularity.** Per-user or per-org. Recommend per-user so you and Shannon can run V2 while external tenants stay on V1.
2. **The Career Library content key.** ~~`aa.quiz` is wrong. Recommend a new `modules.content` key seeded for AA only, which also gives Programs → Content a proper gate for future tenants.~~ **RESOLVED (B1, accepted 2026-09-03):** `modules.content` shipped in `FEATURE_KEYS`, seeded for AA by `supabase/migrations/seed_aa_modules_content.sql`.
3. **Unentitled-route behavior.** ~~Redirect to Home, or a permission-limited screen per Stage 5. Recommend the Stage 5 screen for routes a colleague might legitimately link, Home for everything else.~~ **RESOLVED (B2 kickoff, Remi, 2026-09-03):** the Stage 5 permission-limited screen for routes a colleague might legitimately link, Home for everything else. B2 must state which routes went in which bucket and why.

---

## Appendix — B1 kickoff prompt

> Spec B, stage B1. Read `docs/v2-recon.md` and `docs/v2-preservation-ledger.md` first, plus the Handoff Spec's §05 locked route map. Where Stage 0 and the Handoff Spec disagree, the Handoff Spec wins.
>
> Rewrite `NAV_SECTIONS` in `lib/admin/nav.ts` to the seven V2 destinations with one tab row each. No rendering changes in this stage; the sidebar and `SectionSubNav` keep working off the new model unchanged where possible.
>
> Implement two rules:
> - A destination's landing tab is **computed**: resolve its tabs against `getEntitlements(orgId)` and route to the first survivor. Never a constant.
> - A destination whose tab list resolves empty is removed from the sidebar.
>
> Fix two V1 gating errors while you are in the file: Career Library is gated on `aa.quiz` and should have its own content key; Volunteers is gated on `modules.fundraising` because of where its route sits.
>
> **Before opening the PR, print the resolved navigation for all four orgs**: Ambition Angels, Young, Gifted & Black, Young Life EPA, SafeSpace. For each, list every visible destination, its resolved landing tab, and its full tab row. Confirm Organization lands on Board rather than Strategy for the two 9-key orgs.
>
> Add tests asserting the landing rule and the zero-tab rule against fixture entitlement sets, including a fixture with a destination resolving to zero tabs even though no live org hits that case today.
>
> One PR. Do not touch `app/admin/` rendering, do not add redirects, do not start B2.

## Appendix — B2 kickoff prompt (Remi, 2026-09-03; reference copy — the stage begins only when Remi issues the kickoff, not when its preconditions clear)

> Spec B, stage B2: the redirect map. Read Spec B's architecture section, `docs/v2-preservation-ledger.md`, and the Stage 0 route map in the design bundle.
>
> Every V1 route gets a server-side 308 permanent redirect to its V2 home. Client-side rewrites are insufficient: `notifications.url` holds relative `/admin/...` paths written by `lib/notifications/notify.ts`, those rows persist forever, and operator emails already sitting in inboxes carry V1 paths. Redirects ship before any destination cuts over and are never removed.
>
> Scope:
>
> 1. All 42 rows of the Stage 0 map, in `next.config.mjs` or middleware, whichever the codebase already prefers. Preserve query parameters, including `?student=` and equivalents.
> 2. `lib/admin/actionQueue.ts`'s source-to-route table, which is the single choke point for every obligation deep link. Its nine entries move all queue links at once. Update it here rather than in each destination spec.
> 3. `lib/admin/entities.ts`'s entity-URL resolver, the second choke point, which serves `ops_tasks.linked_entity_*` and `notifications.linked_entity_*`.
>
> Two behaviors to get right:
>
> - A route the current org is not entitled to must not 404 and must not redirect into a destination that is hidden for them. Per Spec B open decision 3: render the Stage 5 permission-limited screen for routes a colleague might legitimately link, and redirect to Home otherwise. State which routes you put in which bucket and why.
> - No redirect may point at a V2 screen that does not exist yet. Until a destination cuts over in its own spec, its V1 route redirects to the V2 shell hosting the V1 page, not to a dead path.
>
> Verify before opening the PR:
>
> 1. An automated crawl of all 42 source routes confirming each returns 308 and terminates, with no loops. This is a test, not a manual pass.
> 2. Take a real `notifications.url` value written in June and confirm it resolves to the correct V2 destination.
> 3. Take an `ops_tasks` row with a non-null `linked_entity_type` (24 exist: 12 `constituent`, 9 `grant`, 3 `partner`) and confirm its resolved URL still opens the right record.
> 4. Run the crawl as each of the four orgs and report any route whose behavior differs, since entitlement changes what a redirect target resolves to.
>
> One PR. Do not touch the shell, do not start B3.
