# BloomOS Typography — "bloomos-to-ten" v1 (type-scale completion + adoption)

Status: **approved spec, not yet built** · Phase 0 recon: 2026-07-15 (branch `claude/bloomos-typography-recon-jpeu69`)
Scope: `app/admin/**` (BloomOS) only. The public marketing site, `/ms`, `/meet` (public), and `/ygb`/`/shannon` are untouched.

## 0. Phase 0 findings (why this spec exists)

Recon of the whole admin surface (88 `page.tsx` files) found:

- A real, canonical scale already exists: `lib/admin/typeScale.ts` (`TYPE`, six roles), frozen by
  `tests/design-tokens.test.ts` and consumed by `PageHeader`, `SectionHeading`, `StatCard`.
  The nickname **"bloomos-to-ten" exists nowhere in code** — it was retired as a dangling
  reference in `specs/bloomos-strategy-command-center.md` v2.1.
- **Page titles: 12 distinct class combos.** 49/88 pages use `PageHeader`; a competing
  hand-rolled family — `font-display font-black uppercase tracking-tight text-3xl sm:text-4xl`
  (and a `4xl/5xl` variant) — owns ~15 pages: all eight `finance/*` sub-pages
  (budget, budget/import, close, config, reconcile, revenue, rules, transactions), `finance/model`,
  `meetings`, `meetings/[id]`, `meetings/upcoming/[eventId]`, `ops/my-week`, `ops/projects`,
  `fundraising/prospects/[id]`, and `ops/_components/RhythmWizard` (drives `ops/monday` + `ops/friday`).
  `demoday` and `meet` (admin) use `text-3xl font-semibold` with **no font token** (falls back to DM Sans).
- **Section headings: ~39 distinct strings.** `SectionHeading` is used in only 11 files while
  `font-heading font-bold text-ink-1 text-sm` (card titles) appears 45+ times and the ops module
  runs its own eyebrow idiom `text-xs uppercase tracking-wider text-ink-2` in ~23 files.
  Modals use a third voice: `text-lg font-display font-bold uppercase tracking-tight`.
- **Body: 215 distinct `<p>` class strings.** The de-facto default is `text-sm text-ink-2`
  (100+ sites) while `TYPE.body` says `text-sm text-ink-1` — token and practice disagree.
- Fonts are fine: no stray families. Inside `.admin-shell`, `--font-heading` **and**
  `--font-display` both resolve to Space Grotesk (`app/layout.tsx` + `globals.css`), and
  `.font-display` forces uppercase — so `font-display` in admin is "shouty Space Grotesk",
  not a different font. `docs/bloomos/06-design-system.md` §2 still claims Poppins/DM Sans
  for the admin, which is stale.

**Verdict: adoption problem, with one definitional gap** — six roles isn't enough to cover the
roles pages actually need, so pages improvised. Fix = grow the scale to ten roles (making
"bloomos-to-ten" literal), then migrate every ad-hoc treatment onto it.

## 1. Decisions (binding)

- **D1 — The ten-role scale.** `TYPE` grows from 6 to 10 roles (§2). The four new roles
  legitimize the highest-frequency wild patterns instead of fighting them.
- **D2 — The display-black h1 family dies in admin.** Every page listed above migrates to
  `PageHeader`. No `font-display font-black` h1 remains under `app/admin/`. The one big
  uppercase voice in the product is gone; hierarchy comes from the eyebrow + title + subtitle
  slots PageHeader already has.
- **D3 — Modals drop the display voice.** Modal titles (QuickAddModal, ReportModal,
  TaskEditModal, AddProspectModal, ProjectListControls) use the new `TYPE.modalTitle`.
- **D4 — `body` stays ink-1; the wild ink-2 default becomes `bodyMuted`.** We do NOT recolor
  100+ call sites: existing `text-sm text-ink-2` is the *correct* rendering of the new
  `bodyMuted` role. The sweep only normalizes oddballs (ordering variants, one-off sizes)
  onto `body` / `bodyMuted` / `metadata`.
- **D5 — Deliberate exemptions** (documented, allow-listed in the drift gate):
  `LoginScreen` (marketing-style dark surface), `strategic-plan/narrative/_components/*`
  (full-screen presentation deck), `Greeting.tsx` (dashboard hero — must *start from*
  `TYPE.pageTitle` and may append `sm:text-3xl tracking-tight`), `font-mono` usages for
  timestamps/amounts (intentional).
- **D6 — Docs and freeze move in the same commit.** `docs/bloomos/06-design-system.md` §2
  gets a corrected Typography section (Space Grotesk voice + the ten roles);
  `tests/design-tokens.test.ts` `FROZEN_TYPE_SCALE` is updated to the ten roles in the same
  commit that changes `typeScale.ts` (that is the point of the freeze).

## 2. The scale (`lib/admin/typeScale.ts` after this spec)

```ts
export const TYPE = {
  /** Page name — one per page, rendered only via PageHeader. */
  pageTitle: "font-heading font-bold text-2xl text-ink-1",
  /** Small uppercase eyebrow above a group of rows/cards (SectionHeading). */
  sectionHeader:
    "font-heading font-semibold text-[11px] uppercase tracking-[0.14em] text-ink-3",
  /** Visible mid-weight section title inside a page (was ad-hoc text-lg). */
  sectionTitle: "font-heading font-bold text-lg text-ink-1",
  /** Title of a card / panel (was ad-hoc text-sm, 45+ sites). */
  cardTitle: "font-heading font-bold text-sm text-ink-1",
  /** Title of a modal / sheet (replaces the uppercase display voice). */
  modalTitle: "font-heading font-bold text-lg text-ink-1",
  /** The big number on a stat card. */
  cardMetric:
    "font-heading font-semibold text-[28px] leading-none tracking-tight tabular-nums text-ink-1",
  /** Uppercase label above a metric. */
  cardLabel:
    "text-[11px] font-heading font-semibold uppercase tracking-[0.12em] text-ink-3",
  /** Primary reading text. */
  body: "text-sm text-ink-1",
  /** Supporting / descriptive text — the de-facto admin default. */
  bodyMuted: "text-sm text-ink-2",
  /** Secondary metadata (dates, owners, hints). */
  metadata: "text-[11px] text-ink-2",
} as const;
```

Notes: `sectionTitle` and `modalTitle` are intentionally identical strings today — they are
separate *roles* so they can diverge later without a migration. Margins/layout utilities are
never part of the scale; call sites append them (`className={`${TYPE.cardTitle} mb-2`}`).

## 3. Phases

Each phase is one commit (or a small stack), each ends green: `npm test && npm run lint && npm run build`.

### Phase 1 — Definition (small, unblocks everything)
1. Extend `lib/admin/typeScale.ts` to the ten roles above (keep the six existing strings byte-identical).
2. Update `FROZEN_TYPE_SCALE` in `tests/design-tokens.test.ts` to match.
3. Rewrite the Typography paragraph of `docs/bloomos/06-design-system.md` §2: BloomOS voice is
   Space Grotesk (`--font-grotesk`) for display+heading inside `.admin-shell`, DM Sans for body;
   list the ten roles and the rule "sizes/weights/tracking are never typed inline — consume `TYPE`
   or a primitive."
4. Migrate the five modal titles to `TYPE.modalTitle` (D3).

### Phase 2 — Title layer (kills the second h1 system)
1. Migrate the ~15 display-black pages (list in §0) to `PageHeader` — title text, existing
   subtitle copy, and any right-aligned controls move into PageHeader's `title`/`subtitle`/
   `actions`/`eyebrow` slots. Behavior-preserving: no copy changes, no layout redesign beyond
   the header block. `RhythmWizard`'s step header uses `TYPE.pageTitle` (it renders its own h1).
2. `demoday` (DemoDaySignups, DemoDayTracker) and admin `meet` (MeetAdmin): replace the
   unstyled `text-3xl font-semibold` h1s with `PageHeader` / `TYPE.pageTitle`.
3. `cohorts`, `cohorts/[id]`, `cohorts/[id]/sessions/[sessionId]`, `messages`, `finance/report`:
   swap hand-rolled h1s for `PageHeader` (or `TYPE.pageTitle` where PageHeader's layout doesn't fit).
4. Fundraising error-state fallback h1s (14 files, `font-heading font-bold text-ink-1 text-2xl mb-4`):
   replace the string with `TYPE.pageTitle` + `mb-4` (import, don't retype).
5. `Greeting.tsx`: rebase on `TYPE.pageTitle` + its responsive/tracking extras (D5).

### Phase 3 — Section layer
1. Ops eyebrow idiom (`text-xs uppercase tracking-wider text-ink-2`, ~23 files under `app/admin/ops/**`
   plus `fundraising/prospects/[id]/_components/*`): migrate to `<SectionHeading>` (or `TYPE.sectionHeader`
   inside components where an h2 tag is wrong). Where the eyebrow carried trailing controls, keep the
   flex wrapper and put SectionHeading inside it.
2. Card titles (`font-heading font-bold text-ink-1 text-sm`, 45+ sites): retype as `TYPE.cardTitle`.
   Mechanical find/replace of the literal string (plus its `mb-*` variants) — rendering is unchanged.
3. `text-lg` section titles (~15 sites) → `TYPE.sectionTitle`.
4. Near-token strays (`text-[11px] uppercase tracking-wider text-ink-3 font-semibold`,
   orange-accent eyebrows, the hex `text-[#bfae93]` rail labels): migrate to `TYPE.sectionHeader`
   (+ a color override utility appended where the accent is deliberate, e.g. `text-orange`).

### Phase 4 — Body sweep + drift gate
1. Normalize paragraph oddballs onto `body` / `bodyMuted` / `metadata`: ordering variants
   (`text-ink-2 text-sm` → `TYPE.bodyMuted`), `text-[13px]`/`text-[15px]` one-offs, and
   `text-[11px] text-ink-3` metadata (→ `TYPE.metadata`; keep ink-3 only where it sits on a
   tinted surface that needs it — judgement call, note exceptions in the PR). Do NOT chase all
   215 variants: anything carrying deliberate semantics (expense red, status colors, italics)
   keeps its color/emphasis and only aligns size via the token.
2. Add `tests/type-drift.test.ts` (config-integrity gate, same spirit as design-tokens):
   scan `app/admin/**/*.tsx` and assert
   (a) no `font-display font-black` anywhere;
   (b) no `<h1` outside the allowlist `[_components/PageHeader.tsx, _components/LoginScreen.tsx,
   _components/Greeting.tsx, strategic-plan/narrative/_components/*]`;
   (c) the retired literals `"font-heading font-bold text-ink-1 text-sm"` and
   `"text-xs uppercase tracking-wider text-ink-2"` do not reappear inside `<h2`/`<h3` tags.

## 4. Out of scope

Public site (`app/(everything not admin)`), `/ms`, LoginScreen and the narrative presenter
(exempt, D5), any color/spacing/layout redesign, Tailwind `fontSize` theme extensions
(the scale stays utility-string-based in `typeScale.ts`), and any Supabase/migration work.

## 5. Acceptance criteria

- `rg -c 'font-display font-black' app/admin` → 0.
- Every admin `page.tsx` h1 renders via PageHeader or an allow-listed exemption.
- `TYPE` has exactly ten roles; `npm test` green (frozen manifests updated deliberately).
- `docs/bloomos/06-design-system.md` §2 matches the shipped scale and the real fonts.
- Visual spot-check (`.claude/skills/verify`) on: `/admin`, `/admin/finance/transactions`,
  `/admin/meetings`, `/admin/ops/monday`, `/admin/ops/projects`, `/admin/fundraising/donors`,
  `/admin/demoday` — titles/sections/body read as one system.

## 6. Kickoff prompt (paste into a fresh session)

> Implement `specs/bloomos-typography.md` ("bloomos-to-ten" v1) end to end. Read the spec first —
> its decisions D1–D6 are binding. Work in four phases, one commit each, in spec order; after every
> phase run `npm test && npm run lint && npm run build` and fix anything you broke before moving on.
> Constraints: `app/admin/**` only; behavior- and copy-preserving (this is a type-scale migration,
> not a redesign); never retype a scale string inline — import `TYPE` or use
> PageHeader/SectionHeading/StatCard; update `tests/design-tokens.test.ts` and
> `docs/bloomos/06-design-system.md` in the same commit as `lib/admin/typeScale.ts` (Phase 1);
> finish with the new `tests/type-drift.test.ts` gate and verify the acceptance criteria in §5,
> including the visual spot-check via the `verify` skill. If a specific call site genuinely can't
> adopt a role without a layout change, leave it, add it to the drift-gate allowlist with a one-line
> comment, and list it in your final summary. Push to the branch you were given and report per phase:
> files touched, count of call sites migrated, and any exemptions added.
