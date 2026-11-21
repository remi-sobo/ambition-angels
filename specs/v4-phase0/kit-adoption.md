# BloomOS kit adoption

Generated 2026-11-21 by `node scripts/kit-adoption.mjs` over 588 files in `app/admin` (the kit itself, `app/admin/_components/ui`, is not counted). Source-level regex counts: use them for trend between stages, not as an audit. Rerun after each stage and commit the result.

## Kit vs hand-built

| Component | Files using the kit | Hand-built | Files with hand-built |
|---|---:|---|---:|
| Button | 13 | 141 hand-built primary buttons | 102 |
| Field | 7 | 687 raw inputs, selects and textareas | 135 |
| DataTable v2 | 3 | 31 raw tables | 23 |
| Drawer / Modal | 4 | 28 hand-built overlays | 26 |

The old client-only `app/admin/_components/DataTable.tsx` (localStorage saved views) is still imported by 2 file(s).

## Lint ratchet (eslint/admin-kit-allowlist.json)

New files may not add any of these; allowlisted files may only go down (`tests/admin-lint-ratchet.test.ts`).

| Rule | Offences | Allowlisted files |
|---|---:|---:|
| raw-table | 31 | 23 |
| overlay | 28 | 26 |
| unlabeled-input | 355 | 102 |

## By area

| Area | Files | Kit Button files | Hand-built primaries | Kit Field files | Raw inputs | DataTable v2 files | Raw tables |
|---|---:|---:|---:|---:|---:|---:|---:|
| _components | 66 | 0 | 12 | 0 | 45 | 0 | 1 |
| _lib | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| (root) | 6 | 0 | 1 | 0 | 0 | 0 | 3 |
| [...not_found] | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| analytics | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| board | 6 | 0 | 2 | 0 | 23 | 0 | 0 |
| briefing | 10 | 0 | 3 | 0 | 0 | 0 | 0 |
| calendar | 4 | 0 | 0 | 0 | 4 | 0 | 0 |
| capture | 12 | 0 | 5 | 0 | 16 | 0 | 0 |
| careers | 7 | 0 | 0 | 0 | 7 | 0 | 0 |
| cohorts | 9 | 0 | 2 | 0 | 13 | 0 | 0 |
| comms | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| compliance | 6 | 0 | 5 | 0 | 32 | 0 | 0 |
| demoday | 5 | 0 | 0 | 0 | 6 | 0 | 1 |
| documents | 5 | 0 | 2 | 0 | 14 | 0 | 0 |
| finance | 43 | 0 | 17 | 0 | 57 | 0 | 7 |
| fundraising | 140 | 5 | 47 | 3 | 255 | 1 | 11 |
| howto | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| impact | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| imports | 3 | 0 | 0 | 0 | 2 | 0 | 1 |
| inbox | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| intake | 4 | 0 | 0 | 0 | 2 | 0 | 0 |
| kit | 3 | 1 | 0 | 1 | 2 | 1 | 0 |
| kpis | 4 | 0 | 1 | 0 | 2 | 0 | 0 |
| legacy | 2 | 0 | 1 | 0 | 4 | 0 | 5 |
| manifest.webmanifest | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| meet | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| meetings | 19 | 0 | 4 | 0 | 19 | 0 | 1 |
| messages | 5 | 2 | 1 | 0 | 3 | 0 | 0 |
| ops | 38 | 1 | 6 | 0 | 29 | 0 | 1 |
| organization | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| organization-health | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| partners | 14 | 0 | 7 | 0 | 34 | 0 | 0 |
| program | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| programs | 22 | 0 | 0 | 0 | 5 | 0 | 0 |
| queue | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| reed | 3 | 0 | 1 | 0 | 0 | 0 | 0 |
| reset-password | 1 | 0 | 2 | 0 | 3 | 0 | 0 |
| settings | 34 | 1 | 6 | 1 | 7 | 1 | 0 |
| staff | 17 | 0 | 5 | 0 | 31 | 0 | 0 |
| strategic-plan | 27 | 0 | 9 | 0 | 52 | 0 | 0 |
| students | 8 | 0 | 2 | 0 | 19 | 0 | 0 |
| today | 7 | 3 | 0 | 2 | 1 | 0 | 0 |
| work | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| ygb | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

## How each number is counted

- **Files using the kit:** a named or default import of the component from `app/admin/_components/ui` (the barrel or its file). Button counts `Button`, `ButtonLink` and `buttonClass`; Field counts the Field family and the bare `Input`/`Select`/`Textarea`/`Checkbox`.
- **Hand-built primary buttons:** a `<button>`, `<a>` or `<Link>` whose class string carries the solid `bg-orange` fill (tints like `bg-orange/10` are not counted).
- **Raw inputs:** every `<input>`, `<select>` and `<textarea>` outside the kit, except `type="hidden"`.
- **Raw tables:** every `<table>` outside the kit.
- **Hand-built overlays and the lint rules:** the selectors in `eslint/admin-kit-rules.js`.
