# Spec: BloomOS typography — one type scale, zero drift ("bloomos-to-ten" v1)

> **Provenance note:** the original `bloomos-to-ten` typography document was never
> committed (see `specs/bloomos-strategy-command-center.md` §"Changes in v2.1", which
> flags it as a dangling reference). This file is a v1 **reconstruction** written at
> implementation time from the sources that do exist: the shipped primitives from
> PR #105 (`lib/admin/typeScale.ts`, `PageHeader`, `SectionHeading`, `StatCard`, the
> `tests/design-tokens.test.ts` freeze), PR #105's explicitly deferred per-page
> rollout, `docs/bloomos/06-design-system.md` §2/§4, and a full survey of the type
> treatments actually rendered across `app/admin/**` today. Decisions D1–D6 below are
> binding for this implementation; if the original document resurfaces and disagrees,
> the original wins and this file gets amended.

## 1. Problem

PR #105 created the one canonical type scale (`TYPE`, six roles) and wired the three
primitives to it, then deferred the per-page rollout. Nothing since has adopted it:
today exactly three files import `TYPE`. Meanwhile `app/admin/**` has ~47 hand-rolled
`<h1>`s, ~345 inline uppercase-label strings, and literal retypes of the role strings
(`tracking-[0.14em]`, `tracking-[0.12em]`, `text-[28px]`) scattered across modules.
Every retype is a future drift point: the scale can change and the copies won't.

## 2. Decisions (binding)

- **D1 — One source of truth.** Every type-scale string lives in
  `lib/admin/typeScale.ts` and nowhere else. Call sites either render through a
  primitive (`PageHeader`, `SectionHeading`, `StatCard`) or compose `TYPE.<role>`
  into `className`. A scale string is never retyped inline in `app/admin/**`.
- **D2 — Ten roles, two voices.** The admin keeps both title voices it actually
  ships: the Poppins UI voice (`pageTitle`) and the editorial display voice
  (`displayTitle` / `displayTitleLg` — `font-display font-black uppercase
  tracking-tight`) already deliberate across Finance, Meetings, Ops, and prospect
  briefs. The scale is exactly ten roles: `pageTitle`, `displayTitle`,
  `displayTitleLg`, `pageSubtitle`, `eyebrow`, `sectionHeader`, `cardMetric`,
  `cardLabel`, `body`, `metadata`. The six pre-existing role values are **unchanged**
  (frozen by `tests/design-tokens.test.ts`); the four new roles capture
  already-shipped patterns verbatim, so Phase 1 changes zero rendered pixels.
- **D3 — Roles carry color; overrides are explicit.** Each role includes its ink
  color. A call site that keeps the role's scale but needs a different color on a
  dark or accent surface appends an important override (`!text-cream`,
  `!text-orange`) after the role — the idiom `StatCard` already uses (`!text-ink-3`
  for muted). A site that needs a different *size* does not half-adopt a role; it
  either stays as-is (and is allowlisted if it trips the gate) or gets its own role
  in a future revision.
- **D4 — Behavior- and copy-preserving.** This is a type-scale migration, not a
  redesign: only `className` values change. Copy, DOM structure, layout, and
  interaction are untouched. Converging an exact/near-duplicate onto its role (e.g.
  a metric missing only `tracking-tight`) is in scope; forcing a bespoke layout into
  `PageHeader`, or flattening the display voice into the Poppins voice, is not. A
  call site that can't adopt a role without a layout change is left alone and
  allowlisted with a one-line reason.
- **D5 — Freeze and docs travel together.** `tests/design-tokens.test.ts` freezes
  `TYPE`. Any change to `lib/admin/typeScale.ts` updates the frozen set **and**
  `docs/bloomos/06-design-system.md` §"Type scale" in the same commit, so every
  scale change is a reviewable diff in three places at once.
- **D6 — A drift gate, not a style guide.** `tests/type-drift.test.ts` scans
  `app/admin/**/*.tsx` for the role fingerprints (§4) and fails on any occurrence
  outside an explicit allowlist. The allowlist is data in the test file — file path,
  fingerprint, one-line reason — and the gate also fails on stale entries (an
  allowlisted violation that no longer exists), so the list can only shrink
  honestly.

## 3. The scale (normative)

| Role | Classes | Use |
|---|---|---|
| `pageTitle` | `font-heading font-bold text-2xl text-ink-1` | Page name, one per module page |
| `displayTitle` | `font-display font-black uppercase tracking-tight text-ink-1 text-3xl sm:text-4xl leading-none` | Editorial page voice (Finance, Meetings, Ops detail pages) |
| `displayTitleLg` | `font-display font-black uppercase tracking-tight text-ink-1 text-4xl sm:text-5xl leading-none` | Editorial voice, module landing hero |
| `pageSubtitle` | `text-sm text-ink-2` | One-liner under a page title |
| `eyebrow` | `text-[10px] uppercase tracking-[0.25em] text-orange/80` | Small kicker above a title |
| `sectionHeader` | `font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3` | Label above a group of cards/rows |
| `cardMetric` | `font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1` | The big number on a stat card |
| `cardLabel` | `text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3` | Uppercase label above a metric |
| `body` | `text-sm text-ink-1` | Default reading text |
| `metadata` | `text-[11px] text-ink-2` | Dates, owners, hints |

Out of scope for v1 (deliberately varied today, candidates for future roles): table
header cells, the display-voice *metric* tail (`font-display font-black text-2xl/3xl/…`
in varied colors across Finance/Ops/Analytics/legacy), chips/badges (owned by
`StatusChip`), and the marketing-style narrative/login surfaces.

## 4. Phases (one commit each, in order)

1. **Canonical scale.** Extend `TYPE` with the four new roles; `PageHeader` consumes
   `pageSubtitle` + `eyebrow`; update the frozen set in `tests/design-tokens.test.ts`
   and add a §"Type scale" table to `docs/bloomos/06-design-system.md`. (This spec
   file lands here too.) Zero visual change.
2. **Titles.** Migrate hand-rolled `<h1>`s and eyebrow kickers in `app/admin/**` onto
   `PageHeader` / `TYPE.pageTitle` / `TYPE.displayTitle(Lg)` / `TYPE.eyebrow`. Exact
   duplicates converge with zero visual change; color-variant sites use D3 overrides.
3. **Sections, labels, metrics.** Migrate inline retypes of `sectionHeader`
   (`tracking-[0.14em]`), `cardLabel` (`tracking-[0.12em]`), and `cardMetric`
   (`text-[28px]`) onto `SectionHeading` / `TYPE`.
4. **Drift gate.** Add `tests/type-drift.test.ts` banning the fingerprints below in
   `app/admin/**/*.tsx` outside the allowlist; verify §5.

**Fingerprints** (each is distinctive to exactly one role, so a hit means a retype):
`tracking-[0.14em]`, `tracking-[0.12em]`, `tracking-[0.25em]`, `text-[28px]`,
`font-display font-black uppercase tracking-tight`, and the co-occurrence of
`font-heading` + `font-bold` + `text-2xl` in one className literal.

## 5. Acceptance criteria

1. `npm test`, `npm run lint`, `npm run build` green after every phase.
2. `tests/type-drift.test.ts` passes: zero fingerprint occurrences in `app/admin/**`
   outside the allowlist, and zero stale allowlist entries.
3. Every module page title renders via `PageHeader` or a `TYPE` title role (or is
   allowlisted with a reason).
4. The diff is copy-preserving: changes in `app/admin/**` touch `className` values
   (and the imports that feed them) only.
5. Visual spot-check via the `verify` skill on representative pages (command center,
   a Finance display-voice page, a Fundraising list page, Ops projects, Cohorts):
   rendering matches pre-migration output modulo documented exact-duplicate
   convergence.
