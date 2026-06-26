# BloomOS Global Search — Spec

> Status: proposal / spec. No code shipped yet.
> A single search bar at the top of the left sidebar that lets you type a name,
> org, deal, task, or page and either jump straight to it (command-palette mode)
> or pull up a **360° profile** that gathers everything BloomOS knows about that
> person or organization — deals, tasks, gifts, grants, meetings, interactions.

This is the "type `koshland` and see the person, their deals, tasks, gifts and
history all in one place" feature.

---

## 1. Why

Right now search in BloomOS is **local and siloed**. Each surface has its own
filter box bound to one table:

| Surface | Search | File |
|---|---|---|
| Donors table | name / email filter | `app/admin/fundraising/donors/_components/DonorsTable.tsx` |
| Add-funder picker | constituent typeahead → `/api/admin/constituents/search` | `app/admin/fundraising/donors/_components/HouseholdControls.tsx` |
| Meeting form | constituent typeahead | `app/admin/meet/NewConnectionForm.tsx` |
| Any `DataTable` | client-side row filter | `app/admin/_components/DataTable.tsx` |

There is **no global Cmd+K / command palette**. To answer "what's the state of
Koshland?" today you'd visit `/admin/fundraising/donors`, search there, open the
detail page, then separately check `/admin/fundraising/grants`, then
`/admin/ops` for related tasks. The data is all linked in Postgres (everything
hangs off `constituents`), but the UI never joins it for a human.

Global search closes that gap with two jobs:

1. **Navigator** — fastest path to any record or page (keyboard-first).
2. **Aggregator** — one query resolves a constituent and fans out across every
   table that references it, rendering a single "what do we know" card.

---

## 2. Placement & trigger

The user's instinct is right: put it **at the top of the left sidebar, above the
"Command Center" nav section**, directly under the BloomOS logo block in
`app/admin/_components/Sidebar.tsx`.

```
┌──────────────────────────┐
│  🌱  BloomOS             │  ← logo block (existing)
├──────────────────────────┤
│  🔍  Search…       ⌘K   │  ← NEW: SearchTrigger (this spec)
├──────────────────────────┤
│  COMMAND CENTER          │  ← existing NAV_SECTIONS
│    Overview              │
│    Strategy              │
│    Executive Briefing    │
│  OPERATIONS              │
│    …                     │
```

Three entry points, one overlay:

- **Sidebar trigger** (desktop `lg+`): a non-functional-looking button styled
  like an input — `🔍 Search…` with a `⌘K` hint chip on the right. Clicking it
  opens the overlay. It is a button, not a live `<input>`, so the heavy palette
  JS only mounts when summoned.
- **Keyboard**: `⌘K` (mac) / `Ctrl+K` (win) anywhere in `/admin`. `/` also opens
  it when focus isn't already in a text field (GitHub convention). A global
  listener lives in `layout.tsx` (the only always-mounted admin client island).
- **Mobile**: a search icon in `MobileTabBar.tsx`. The overlay becomes a
  full-height sheet, consistent with the existing `QuickAddModal` bottom-sheet
  pattern.

The overlay itself is a centered modal (desktop) / full sheet (mobile), built on
the same `role="dialog"` + `aria-modal` + `backdrop-blur-sm` pattern already used
by `QuickAddModal`. It does **not** disturb the three-column shell — it floats
above everything at `z-[60]` (above the mobile drawer's `z-50`).

---

## 3. Two modes in one overlay

The overlay has a single text field. What it renders below depends on what you're
doing:

### Mode A — Palette (default, every keystroke)

Debounced (~150ms) instant results, **grouped by type**, capped per group. This
is the "navigate / jump to" mode. Pressing `↵` on a result navigates; `⌘↵` opens
in a new tab.

```
┌─────────────────────────────────────────────┐
│ 🔍 koshland                              esc │
├─────────────────────────────────────────────┤
│ PEOPLE & ORGS                                 │
│  🏛  Koshland Foundation        org · funder  │
│  👤  Daniel Koshland            person        │
│                                               │
│ DEALS & GRANTS                                │
│  💰  Koshland — General Operating  Grant·LOI  │
│  💰  FY26 Koshland renewal      Commitment    │
│                                               │
│ TASKS                                         │
│  ✓  Send Koshland LOI draft     due Fri·Remi  │
│                                               │
│ PAGES & ACTIONS                               │
│  →  Grants pipeline                           │
│  +  Log interaction with Koshland             │
└─────────────────────────────────────────────┘
   ↑↓ navigate   ↵ open   ⌘↵ new tab   ⇥ profile
```

### Mode B — Entity Profile / 360 card

When the top hit is a **person or organization** (constituent or HubSpot
prospect), pressing `⇥` (or clicking a "View everything →" affordance on that
row) swaps the palette for an **aggregated profile** rendered *inside the
overlay* — no navigation required. This is the answer to "bring up koshland and
show the person, deals, tasks, etc."

```
┌──────────────────────────────────────────────────────┐
│ ←  🏛 Koshland Foundation              Open full page →│
│    Organization · Funder · SF, CA · last touch 12d ago │
├───────────────────┬──────────────────────────────────┤
│ AT A GLANCE       │ ACTIVITY (most recent)            │
│  Lifetime  $75,000│  ✉  LOI sent          Jun 14      │
│  Open grants  2   │  ☎  Call w/ program officer Jun 2 │
│  Open tasks   1   │  📅 Site visit         May 20     │
│  Stage   Proposal │  💵 Gift $25,000       FY24        │
├───────────────────┴──────────────────────────────────┤
│ GRANTS / DEALS                                         │
│  💰 General Operating  $50k req · LOI · due Jul 1      │
│  💰 FY26 renewal       $25k · projected               │
│ GIFTS                                                  │
│  💵 $25,000  check  2024-03-11  General Fund           │
│ TASKS                                                  │
│  ✓ Send Koshland LOI draft   due Fri · Remi · urgent  │
│ PEOPLE                                                 │
│  👤 Daniel Koshland (board contact)                    │
│ MEETINGS                                               │
│  📅 Site visit — May 20 (held)                         │
└────────────────────────────────────────────────────── ┘
```

Each section is a live link into the relevant module
(`/admin/fundraising/donors/[id]`, `/admin/fundraising/grants`, `/admin/ops?...`).
"Open full page →" routes to the constituent's donor record. Sections with zero
rows collapse.

This profile is the differentiator. The palette is table stakes; the 360 card is
what makes search *useful* rather than just *fast*.

---

## 4. What it searches — data sources

Everything in BloomOS hangs off **`constituents`** (the fundraising spine), so
the aggregator is mostly a matter of following foreign keys. Tables grounded in
`supabase/migrations/*`:

### Tier 1 — indexed primary matches (palette + profile anchors)

| Entity | Table | Match fields | Result links to |
|---|---|---|---|
| People / Orgs | `constituents` | `first_name`, `last_name`, `org_name`, `emails[]` | `/admin/fundraising/donors/[id]` |
| Prospects (not yet on spine) | `hs_contacts` / `hs_companies` | `first_name`, `last_name`, `company`, `email`, `name` | prospect detail / promote |
| Students | `students` | `first_name`, `last_name`, `email`, `school` | `/admin/students` |
| Partners | `partners` | `name`, `champion_name`, `champion_email` | `/admin/partners/[id]` |
| Grants / deals | `grants` | `name`, `program`, `owner` | `/admin/fundraising/grants` |
| Commitments | `fin_revenue_commitments` | `source_name` | `/admin/finance/revenue` |
| HubSpot deals | `hs_deals` | `name` | prospect / deal view |
| Tasks | `ops_tasks` | `title`, `description` | `/admin/ops` |
| Projects | `ops_projects` | `title`, `description` | `/admin/ops/projects/[id]` |
| Meetings | `bookings` | `attendee_name`, `attendee_email` | `/admin/meetings` |
| Cohorts | `cohorts` | `name`, `program`, `term`, `location` | `/admin/cohorts/[id]` |

### Tier 2 — full-text / fuzzy (behind a "search notes & history" affordance, or always for short result sets)

`interactions.notes`, `ops_tasks.description`, `fr_prospect_briefs.content`
(JSONB), `meeting_records.notes`, `email_campaigns.name`/`subject`,
`partner_interactions.notes`, `demoday_signups`.

### Static / navigational

The 7 `NAV_SECTIONS` from `Sidebar.tsx` (every page label + route) and a small
registry of **Quick Actions** ("New task", "Log gift", "Add prospect", "Book
meeting"). These need no DB query — they're matched client-side so pages/actions
always appear instantly even before the network round-trip resolves.

### The aggregation graph (how the 360 card is built)

Once a `constituent.id` is resolved, fan out:

```
constituents.id
 ├─ gifts (constituent_id)                    → lifetime $, recent gifts
 ├─ grants (funder_id)                         → open deals / pipeline stage
 ├─ recurring_plans (constituent_id)           → active monthly giving
 ├─ interactions (constituent_id)              → activity timeline
 ├─ relationships (a_id / b_id)                → connected people (spouse, board)
 ├─ households (household_id)                  → household members
 ├─ students (constituent_id)                  → linked student, if any
 ├─ partners (constituent_id)                  → linked partner org
 └─ ops_tasks (linked_entity_type='constituent'│ → open tasks
                AND linked_entity_id = id)
```

For a HubSpot-only prospect (no spine row yet), the timeline comes from
`hs_engagements` (matched via `contact_ids[]` / `company_ids[]` / `deal_ids[]`)
plus `fr_touches` / `fr_email_drafts` / `fr_prospect_briefs` keyed by
`hubspot_contact_id`. This mirrors how `/api/admin/constituents/search` already
blends spine + mirror today.

> **Note on `koshland`:** there is no `koshland` record in the codebase yet —
> the only hit is a route guard for `/update/koshland` in
> `components/SiteChrome.tsx` (a bespoke donor-update page). In production a
> Koshland foundation would live as a `constituents` row (`type='organization'`)
> with `grants.funder_id` pointing at it. The walkthrough above is the intended
> behavior once that record exists.

---

## 5. Ranking & grouping

Palette ordering, highest first:

1. **Exact / prefix name match** on a Tier-1 entity (a query of `kosh` ranks
   "Koshland" above a task that merely mentions Koshland in its description).
2. **Recency & heat** — `last_touch_at` / `last_activity_at` / `updated_at`.
   A constituent you emailed yesterday outranks a dormant one.
3. **Entity priority** — People & Orgs > Deals/Grants > Tasks > Pages/Actions
   when scores tie (people are what users search for most).
4. **Open/active state** — open tasks and active grants rank above
   done/archived.

Per-group cap of ~4 rows with a "Show all N in {Module} →" footer that deep-links
to the module's own filtered table. Pages & Actions are always shown (cheap,
client-side) so the palette is never empty.

Matching: case-insensitive substring (`ilike '%q%'`) for v1, matching the
existing endpoint. Upgrade path to Postgres trigram (`pg_trgm` + `gin`) for typo
tolerance ("koshlnd" → "Koshland") and `tsvector` for the Tier-2 notes search.

---

## 6. Backend

### Endpoint

`GET /api/admin/search?q=<term>&scope=<all|people|deals|tasks|...>`

Generalizes the existing `app/api/admin/constituents/search/route.ts` (same auth
guard `isAuthed()`, same RLS user-session client `createServerSupabase()`, same
`.replace(/[(),*%]/g, " ")` sanitization of the PostgREST `or()` grammar).
Returns a normalized union:

```ts
type SearchHit = {
  kind: "constituent" | "prospect" | "student" | "partner" | "grant"
      | "commitment" | "task" | "project" | "booking" | "cohort"
      | "page" | "action";
  id: string | null;          // null for hubspot-only / pages
  hubspotId?: string | null;
  title: string;              // display name
  subtitle?: string;          // "Organization · Funder · SF, CA"
  badge?: string;             // "LOI", "urgent", "active"
  href: string;               // where ↵ navigates
  score: number;              // server-computed rank
  meta?: Record<string, unknown>;
};
```

Fan-out queries run in parallel (`Promise.all`) and each is `.limit(5)`-capped so
the palette stays fast. A query under 2 chars returns only Pages/Actions (handled
client-side) — no DB hit.

### Profile endpoint

`GET /api/admin/search/profile?type=constituent&id=<uuid>` (or `&hubspotId=`)
returns the aggregated 360 payload — the FK fan-out from §4. Implemented as a
single Supabase RPC / Postgres function `bloomos_constituent_profile(id)` that
returns one JSON blob (gifts summary, open grants, open tasks, timeline, related
people), so the overlay makes exactly one request when entering Mode B.

### Performance

- Indexes already exist on the hot columns (`constituents_last_name_idx`,
  `hs_contacts_email_idx`, etc.). Add `pg_trgm` GIN indexes on
  `constituents(first_name, last_name, org_name)` and `grants(name)` when fuzzy
  matching lands.
- Palette responses are tiny (≤ ~40 rows). No pagination in the overlay —
  "Show all" hands off to the module table.
- Client debounce 150ms + abort-in-flight on new keystroke (AbortController) so
  fast typing doesn't stack requests.

### Permissions

All queries go through the RLS user-session client and the `isAuthed()` guard,
exactly as the constituents endpoint does today, so search can never surface a
row the signed-in admin couldn't already open. Role differences (Remi vs Shannon)
are enforced by RLS, not by the search layer.

---

## 7. Visual design (BloomOS tokens)

Overlay matches the dark admin shell, not the public site:

- Surface: `bg-[#1F1811]` / `bg-ink`, text `text-cream` / `text-ink-1`
  (`#FBE6D2`), borders `border-white/10`.
- Active row: `bg-orange` accent or `bg-white/[0.06]` hover, with the same
  left-border orange tick the sidebar uses for the active nav item.
- Group headers: `text-[10px] uppercase tracking-[0.14em] text-[#bfae93]`
  (identical to `NAV_SECTIONS` labels — visual continuity with the sidebar).
- Type icons via **lucide-react** (already a dependency): `Building2` (org),
  `User` (person), `HandCoins`/`Banknote` (gift/grant), `CheckSquare` (task),
  `Calendar` (meeting), `GraduationCap` (student), `ArrowRight` (page).
- The `⌘K` hint chip and `esc` use the muted `text-[#8d7c63]` treatment.
- Radii `rounded-card`, shadow consistent with `QuickAddModal`.

---

## 8. Keyboard & accessibility

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` / `/` | Open overlay |
| `↑` `↓` | Move selection |
| `↵` | Open selected (navigate) |
| `⌘↵` | Open in new tab |
| `⇥` | Expand top person/org into 360 profile (Mode B) |
| `←` / `esc` (in Mode B) | Back to palette |
| `esc` | Close overlay |

- Full ARIA combobox pattern: `role="combobox"` input, `role="listbox"` results,
  `aria-activedescendant` tracking the highlighted row, `aria-selected`.
- Focus trap inside the dialog; focus returns to the trigger on close.
- Honors `prefers-reduced-motion` (the codebase already gates animations on it).
- Selection state announced via `aria-live="polite"` result count.

---

## 9. Build phases

**Phase 1 — Palette MVP (navigator).**
SearchTrigger in `Sidebar.tsx` + `⌘K` listener in `layout.tsx` + overlay
component. `/api/admin/search` covering Tier-1 entities + static Pages/Actions.
Keyboard nav, grouped results, navigate on `↵`. This alone replaces "where's the
page for X" and "find this donor."

**Phase 2 — 360 Entity Profile (aggregator).**
`bloomos_constituent_profile` RPC + `/api/admin/search/profile` + Mode B render
inside the overlay. The Koshland use case. Reuse existing widgets where possible
(`EntityTasks.tsx`, `Pipeline.tsx`, `StatCard.tsx`).

**Phase 3 — Fuzzy + notes.**
`pg_trgm` typo tolerance, `tsvector` full-text over Tier-2 (interactions, briefs,
meeting notes). "Search history & notes" toggle.

**Phase 4 — Polish.**
Recent searches (localStorage), "jump back to" recently-viewed entities when the
field is empty, per-scope filters (`people:`, `deal:`, `task:` prefixes), and an
optional "Ask Reed about {entity}" handoff into the existing Reed agent.

---

## 10. Open questions

1. **Scope of v1 entities** — ship all Tier-1 tables at once, or start with
   constituents + grants + tasks (the Koshland triad) and add the rest behind the
   same endpoint?
2. **Mode B trigger** — is `⇥`-to-expand discoverable enough, or should the top
   person/org result always render a compact inline profile preview?
3. **Empty-state** — when the field is empty, show recent searches, today's
   pinned tasks, or nothing?
4. **Reed handoff** — should the 360 card include an "Ask Reed" button now
   (Phase 2) or wait until Phase 4?
5. **Students & minors** — students include guardian PII. Confirm RLS already
   scopes student rows appropriately before surfacing them in search.
