# Spec Organization — the seventh destination: Strategy + Team + Board + Compliance

The seventh destination cutover, and the most finished before it starts: all four tabs have hosted their live V1 screens since B2, and the recon marks every screen bindable. What remains is the fate of Strategy's children — two working sub-screens whose at-cutover rows would today 308 into 404s — and the cutover itself. Two stages, no new screens, no migrations.
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§F.1, §G), `docs/v2-preservation-ledger.md`, Spec B (the B2 host pattern this spec applies twice more), Specs Home/Fundraising/Finance/Work/Programs/Impact (all merged; six destinations live). The F6 row-narrowing discipline governs the child rows.

---

## Problem statement

Organization is the org looking at itself: the strategic plan, the team, the board, compliance. The V2 model gives it four tabs — Strategy · Team · Board · Compliance — and uniquely, all four already render their real screens at their V2 paths (`/admin/strategic-plan`, `/admin/staff`, `/admin/board`, `/admin/compliance` all 308 to hosts since B2). What blocks the cutover is Strategy's orbit: `/admin/strategic-plan/objective/[id]` (the objective detail) and `/admin/strategic-plan/review` (the monthly review) carry at-cutover rows targeting `/admin/organization/strategy` — but activating them as written would 308 `objective/<id>` to `/admin/organization/strategy/<id>` and `review` to the bare landing, a 404 and a lost screen respectively. The F6 discipline (no child ever 308s into a 404; a working surface is never parked) says these rows need seats before they activate. This spec seats them the cheapest honest way — B2-style hosts — and cuts the destination over.

## Who's affected

AA and YGB hold all four keys → four tabs, landing on Strategy. The 9-key orgs hold `modules.board` + `modules.compliance` only → two tabs, landing on Board (the shell's existing pinned behavior — the model's landing rule, not a deviation). Remi's monthly review ritual and the board's meeting prep live here; nothing about either may change shape mid-move.

## Current behavior

The four bases 308 to their hosts, which re-export the V1 pages (Strategy = the 434-line plan page with its own in-body section menu; sub-pages get the `SectionNav` chip bar from the V1 layout). `/admin/strategic-plan/scorecard` already 308s to Impact → KPIs (I4). `/admin/strategic-plan/objective/[id]` and `/review` render inside the V1 layout at V1 paths. `/admin/strategic-plan/setup` is a settings-null at-cutover row; `/narrative` and `/people` are NO_HOME (the plan page's own menu links keep them reachable); `/admin/staff/reviews` is NO_HOME (`modules.reviews` — the recon's ⚑: nearest seat Team-as-a-section, undesigned). The Organization tab slot renders the V1 SectionSubNav.

## Desired behavior

The objective detail and the monthly review live under Strategy's path — `/admin/organization/strategy/objective/[id]` and `/admin/organization/strategy/review` — as hosts rendering the V1 screens unmodified, chip bar included, with their V1 routes 308ing. Setup stays a settings row; narrative, people, and staff-reviews stay NO_HOME, reachable exactly as today. At cutover `"organization"` joins `V2_CUTOVER_DESTINATIONS` and the tab slot flips.

## Scope

**In.**
- Two B2-style hosts: `organization/strategy/objective/[id]` and `organization/strategy/review`, pure re-exports of the V1 pages, with the `SectionNav` chip bar preserved for the children (a nested layout — the bar's V1-path links ride the 308s, so nothing dead-ends).
- The two rows re-targeted to their real seats (objective: prefix → `…/strategy/objective`; review: exact → `…/strategy/review`) — dispositions corrected merged → re-homed, the honest word for a screen that keeps its shape (as-built note).
- The Organization cutover: both rows activate, `"organization"` joins the set, config↔map agreement, four-org printout + crawl.

**Out.**
- Any Strategy/Team/Board/Compliance screen rework — all four are "restructuring" surfaces that already carry their screens; a redesign is a later pass (the Grants/Campaigns precedent, now five specs deep).
- Board packet-gated-on-close (new logic across `fin_*` close state) and the §C `board_members.constituent_id` backfill (7 of 12 populated) — both named future work, neither a cutover rider.
- `/admin/strategic-plan/setup` — settings-null stands until a Settings destination exists (the Setup screen's step-state store is UNBOUND anyway).
- `/admin/strategic-plan/narrative` + `/people` — NO_HOME stands (decision 2); the plan page's own menu keeps both reachable, the careers-daily precedent.
- `/admin/staff/reviews` (`modules.reviews`) — NO_HOME stands (decision 3); its nearest seat (Team, as a section) is undesigned and stays a flagged question, not a rushed build.
- **No migrations.** Nothing in this spec touches the schema.

## Architecture

### The screens and their sources (recon §G — all bindable, all live)

| Screen | Source | Status |
|---|---|---|
| Strategy | `plan_objectives`, `plan_goals`, `plan_kpis`, `plan_initiatives`, `plan_reviews` | live host, kept; objective/[id] + review get seats (O1) |
| Team | `staff`, `staff_goals`, `memberships`, `invitations`, load via `ops_tasks`/`work_blocks` | live host, kept |
| Board | `board_meetings`, `board_members` (terms, officer role, COI; gave-this-year partial pending §C) | live host, kept |
| Compliance | `compliance_items` + `compliance_filings` | live host, kept |

### The child seats (the F6 discipline, applied before it bites)

Activating `objective` (prefix → `/admin/organization/strategy`) as written would translate `objective/<id>` to `strategy/<id>` — no such page. Activating `review` (exact → the landing) would 308 a working ritual into a page that doesn't contain it. Both rows therefore re-target to child seats that exist first: the B2 host move, third application (`work/meetings/upcoming` and `programs/cohorts/[id]` walked this road). The hosts re-export; the children's chip bar (`SectionNav`) renders from a nested layout so sub-page navigation survives at the new paths — its V1-path links 308 through, the same way every V1 sidebar link has since H3.

### The cutover (eighth and second-to-last use of Spec B's machinery)

Rows activating: `/admin/strategic-plan/objective` → `/admin/organization/strategy/objective` (prefix), `/admin/strategic-plan/review` → `/admin/organization/strategy/review` (exact). Staying: setup (settings-null), narrative/people/staff-reviews (NO_HOME). `"organization"` joins `V2_CUTOVER_DESTINATIONS`. After this, Inbox is the last destination and `NAV_SECTIONS` the last deletion.

## Staged build order

**O1 — Strategy's children.** The two hosts + nested `SectionNav` layout + rows re-targeted (still at-cutover); V1 routes byte-identical. Commit: `spec-org: strategy-children`.

**O2 — cutover.** Both rows activate in map + config, `"organization"` joins the set, verification: four-org printout (AA/YGB four tabs landing Strategy; 9-key two tabs landing Board), live crawl (both 308s with query survival; setup/narrative/people/staff-reviews live and un-redirected). Commit: `spec-org: cutover`.

> **As built (O2, 2026-09-09 — pending Remi's acceptance).** Both rows
> graduated with O1's re-targets; the objective base joined the disk test's
> no-base-page set (only `[id]` is real, same as V1 — the
> meetings/upcoming precedent). Verified by live crawl (both moves 308 to
> the O1 seats, `?tab=goals` surviving the objective hop; setup, narrative,
> people, and staff/reviews answer only the pre-existing auth 307) and the
> four-org printout (AA/YGB: Strategy · Team · Board · Compliance landing
> Strategy; the 9-key orgs: Board · Compliance landing Board). With
> `"organization"` in the cutover set, ALL SEVEN destinations render the V2
> tab row — Inbox and the `NAV_SECTIONS` deletion are what remain of the
> whole V2 map.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As AA or YGB, Organization renders four tabs landing on Strategy; as a 9-key org, two tabs landing on Board.
2. `/admin/strategic-plan/objective/<id>` 308s to the objective detail at its Strategy seat — same screen, chip bar intact; `/admin/strategic-plan/review` likewise to the monthly review. No child anywhere 308s into a 404.
3. The monthly review ritual works end-to-end at the new path exactly as it did — the host is a re-export, pinned thin.
4. Setup, narrative, people, and staff-reviews answer exactly as before — live, no 308, reachable through the plan page's own menu (and the review of the ⚑ keys stays on the record, not silently dropped).
5. With the V2 flag off, everything except the two new 308s is byte-for-byte V1.
6. No migrations: the ledger check sees nothing from this spec.

## Failure modes

**A child 308s into a 404.** The whole reason O1 exists. The rows re-target BEFORE activating; the crawl proves `objective/<id>` lands on a real page.

**The chip bar dies at the new paths.** V1 sub-pages get `SectionNav` from the V1 layout; hosts that skip it strand the children without their menu. The nested layout carries it; the landing stays bar-less exactly as V1 (the bar hides itself only on the V1 base path, so the V2 landing must simply not render it — the landing host keeps its current layout).

**The review ritual changes shape in the move.** It's a re-export — the pin tests enforce that nothing but the path moved.

**"While we're in there" rework.** Four live screens, zero redesign budget in this spec. Board packet-gating and the Team reviews section are named future work; a cutover that sneaks either in breaks the pattern that has shipped six destinations safely.

## Open decisions — all three resolved (Remi, 2026-09-09, as recommended)

1. **The children's shape — RESOLVED: child hosts.** Move the URLs, change nothing else; absorbing the review onto the plan landing stays open for a real Strategy pass later.

2. **Narrative and People — RESOLVED: NO_HOME stands.** Reachable through the plan page's own menu.

3. **Staff reviews — RESOLVED: NO_HOME stands.** The Team-as-a-section question joins the October pile; the route stays live.

---

*Spec approved 2026-09-09. O1 kicked off the same day.*
