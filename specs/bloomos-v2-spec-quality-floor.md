# Spec Quality Floor — the layer between the system and the person

Not a destination — the floor every destination stands on. The V2 rebuild is complete (eight specs, seven destinations + Inbox on one shell, one nav model), and an external audit run against the pre-rebuild repo was re-checked against post-rebuild main: four of its five findings survive intact, one (the dual-IA finding) the rebuild closed outright. This spec installs the missing primitives once, for every route.
Date: 2026-09-09 · Depends on: the completed V2 rebuild (Specs B through Inbox, all merged; `tests/v1-retirement.test.ts` is the record), the external audit ("BloomOS: Audit Findings and the Quality Floor Spec", re-verified on main at `72aeb37`), `specs/bloomos-typography.md` (approved, unbuilt — decision 4 governs the collision), `lib/admin/typeScale.ts` + `tests/design-tokens.test.ts` + `tests/type-drift.test.ts` (the token machinery this spec extends).

---

## Problem statement

BloomOS is architecturally strong and visually deliberate, but the layer between the system and the person using it is missing — and the audit's re-check proves the rebuild didn't touch it, because no destination spec owned it. On main today: **zero** `loading.tsx`, `error.tsx`, or `not-found.tsx` anywhere; **141 `alert()`** calls in 78 files and **54 `confirm()`** in 44, with raw HTTP status codes as the dominant failure copy and zero toast layer; **`ink-3` (#9A8B7C) used 881 times in 239 files** at 2.88:1 on the app background — a WCAG AA failure the canonical type scale itself codifies, and one the rebuild *grew* (779 → 881) because new screens followed house style; **`EmptyState` imported by 7 files, all under `/admin/staff`**; ~176 em dashes in quoted UI strings. Shannon clicks Finance and sees nothing, then everything; a failed grant save says `HTTP 500` in a browser dialog; the label over every number is the hardest text on the screen to read. Every one of these is now fixable once, under one chrome, because the rebuild left exactly one.

## Who's affected

Every user of every org, on every screen — that is the point of a floor. The audit's framing stands: the buyer is a nonprofit director, and this is the layer that decides whether the software feels trustworthy.

## Current behavior

Every admin page is a server component that awaits its data before painting; there is no skeleton, no error boundary, no admin-chromed 404. Failure feedback is `alert(j.error ?? \`HTTP ${res.status}\`)`; destructive gates are `confirm()`. The audit's F4 (two live IAs) is **resolved** — one nav model, one chrome, every V1 URL 308ing — and its Phase 6 (cutover schedule) is moot. The typography spec is approved and unbuilt; its drift gate (`tests/type-drift.test.ts`) half-exists, its role unification does not.

## Desired behavior

Loading paints the shell with a page-shaped skeleton (after a 150ms grace so fast loads never flash). A thrown error renders inside the shell with a retry and a way home, and reports before it renders. A dead URL 404s in the chrome. Failure copy is a sentence a director can act on — never a status code; destructive actions get a real dialog with the consequence stated and the verb on the button. Every foreground/background token pair used under 18px measures ≥ 4.5:1, asserted in CI so the scale can never freeze a failing pair again. Every list surface has an empty state that names what's missing and offers the action that creates it. No em dash in rendered copy except the `—` empty-value placeholder.

## Scope

**In.** The six stages below: resilience primitives; the toast/dialog/error-message layer; the 195-site feedback migration with a lint ban; contrast + type-floor remediation with a CI contrast gate; `EmptyState` adoption; the copy sweep.

**Out.**
- The audit's Phase 6 (cutover schedule) — **done by the rebuild**; nothing to schedule.
- `specs/bloomos-typography.md`'s ten-role unification — it stands as its own spec; decision 4 resolves the collision (this spec amends token *values* and adds the gate; that spec inherits them).
- RLS, the migration ledger, tenant hardening, auth token migration — already tracked elsewhere.
- The public site, `/ms`, `/teens`, `/meet`, `/ygb`.
- Folding the 44 V1-page-body re-exports into their hosts — internal code organization, a later chore, not this floor.
- **No migrations.** Nothing here touches the schema.

## Architecture

**Resilience primitives.** Three files at `app/admin/`, inherited by every route through App Router nesting — and since the V1 retirement there is exactly ONE chrome to inherit into. `loading.tsx` renders `<PageSkeleton />`; the layout (sidebar, tab zone, mobile bar) stays painted and only the main column shows the skeleton. `error.tsx` is a client component `{ error, reset }` rendering in-shell with a retry and a link to `/admin/today`; it reports (digest + path) before it renders — Next already logs the server-side throw with the same digest, so the digest is the join key. `not-found.tsx` renders in-shell; a `[...not_found]` catch-all page invokes it for URLs matching no route, so stale links 404 in the chrome instead of the framework default. Heavy modules (finance, fundraising, programs) get segment `loading.tsx` variants. `PageSkeleton` reads `PageHeader`/`StatCard`/`TYPE` proportions — page-shaped, never a spinner — and carries the 150ms appearance grace (decision 2).

**Feedback layer.** `ToastProvider` mounts in the admin layout; `useToast()` exposes `success`/`error`/`info`; `useConfirm()` returns a promise-based dialog so `if (!confirm(...))` becomes `if (!(await confirm({...})))` — mechanical to migrate, and permanent actions keep their interruption with the consequence stated and the confirming verb on the button. Between fetch and toast sits `lib/admin/errors.ts` → `userMessage(res, json)`: status classes map to actionable sentences; the status is logged, never displayed. An ESLint rule bans `alert`/`confirm`/`prompt` in `app/admin/**` once migration completes.

**Tokens.** `ink-3` moves to the LIGHTEST value clearing 4.5:1 on `app` cream (decision 1); the three status tokens failing on `app` gain `-text` variants tuned to it (the `status.critical-text` pattern); muted-small roles rise to a 12px floor; the 9px/8px stragglers are swept. A contrast assertion joins `tests/design-tokens.test.ts`: every foreground token × all three backgrounds, fail below 4.5:1 for any role under 18px — reverting `ink-3` fails the build.

## Staged build order

**Q1 — resilience primitives.** `PageSkeleton` + the three files at `app/admin/` + the catch-all + segment skeletons for finance/fundraising/programs. No existing page changes. Commit: `spec-qf: resilience`.

**Q2 — feedback infrastructure.** `ToastProvider`, `useToast`, `useConfirm`, `lib/admin/errors.ts` with unit tests on the status mapping. Mounted, zero call sites migrated. Commit: `spec-qf: feedback-infra`.

**Q3 — feedback migration.** All 141 `alert()` + 54 `confirm()` sites, by file never by regex, batched by module; destructive confirms first, then raw-status alerts, then the rest; the ESLint ban lands in the final commit. Commit(s): `spec-qf: feedback-<module>`, `spec-qf: feedback-ban`.

**Q4 — contrast + type floor.** The token changes + `-text` variants + the 12px floor + the contrast gate, in one commit so the gate and the values land together. The typography spec gets a one-paragraph amendment inheriting the new values (decision 4). Side-by-side eyeball of Today, Finance, and a Donor 360 before committing (the audit's "denser without anyone saying why" failure mode). Commit: `spec-qf: contrast`.

**Q5 — empty states.** `EmptyState` gains an action slot; adopted across every list surface, first-run screens first (Today, People, Donors & Funders, Tasks). The V2 screens that shipped honest inline empty states (Attendance, Outcomes, Overview, Reports) converge onto the component. Commit: `spec-qf: empty-states`.

**Q6 — copy sweep.** Em dashes out of rendered strings, the `—` placeholder untouched (decision 3). Commit: `spec-qf: copy`.

Each stage is one PR (Q3 may batch). Remi merges every PR and starts every stage.

## Definition of done

1. A thrown error in any admin server component renders inside the BloomOS shell with a working retry, and the digest appears in logs; a dead `/admin/*` URL 404s in the chrome.
2. Throttled to Slow 3G, `/admin/finance` shows a page-shaped skeleton in the shell — and a fast load paints straight to content with no flash (the 150ms grace, tested).
3. `grep -rn "alert(\|confirm(" app/admin --include=*.tsx` returns zero, and lint fails on reintroduction.
4. No rendered string contains an HTTP status code; a forced 500 on a save shows a sentence naming what failed and what to do.
5. The contrast gate passes, and reverting `ink-3` to `#9A8B7C` fails the build. No `text-[8px]`/`[9px]` remains; muted roles sit at ≥12px.
6. A zero-row tenant can visit all seven destinations + Inbox and every panel shows data or an `EmptyState` with an action.
7. No em dash in rendered copy except the placeholder.
8. No migrations: the ledger sees nothing from this spec.

## Failure modes

**The skeleton flash.** Mitigated by design (the 150ms grace lives IN `PageSkeleton`), and tested.

**The error boundary swallows observability.** `error.tsx` reports before it renders; Q1 does not merge until a forced throw shows its digest in logs.

**The mechanical migration loses meaning.** A regex turns confirmations and successes into `toast.error`. By file, by module, reviewed in batches — never one PR of 78 files.

**The darker `ink-3` makes the workspace heavy.** Lightest passing value, side-by-side on three screens before committing.

**The typography-spec collision.** Both touch `typeScale.ts` and the token tests. Decision 4 resolves the order; the amendment in Q4 makes the inheritance explicit so a future build of that spec cannot silently revert the fix.

**Empty states that lecture.** An empty panel that explains the module is documentation; one that names the missing thing and offers its creating action is a floor. DoD 6 tests the action, not the prose.

## Open decisions — all four resolved (Remi, 2026-09-09, as recommended)

1. **The `ink-3` replacement — RESOLVED: lightest value ≥ 4.5:1 on `app` cream** (the #7A6A59 region), chosen by computed ratio in the token test plus the three-screen side-by-side — never a "safe dark".

2. **The skeleton grace — RESOLVED: 150ms** before the skeleton appears, so fast loads paint straight to content.

3. **The em-dash policy — RESOLVED: placeholder stays, rendered copy converts.** The `—` empty-value glyph is data, not prose. Em dashes in rendered sentences convert to periods or commas in Q6. Specs, comments, and commit messages are not user-facing and keep the house voice.

4. **The typography-spec ordering — RESOLVED: the floor does not wait.** The contrast failure is a shipping WCAG violation; Q4 lands now, and `specs/bloomos-typography.md` is amended in the same commit to inherit the new token values and the contrast gate, so its future build starts from the fixed floor instead of re-freezing the failure.

---

*Spec approved 2026-09-09. Q1 kicked off the same day.*
