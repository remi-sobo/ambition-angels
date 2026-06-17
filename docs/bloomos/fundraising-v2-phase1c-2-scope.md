# Fundraising v2 — Scope: Phase 1C (Constituent 360 + Gmail) & Phase 2 (Today's Moves)

Spec: `specs/fundraising-v2.md`. This document scopes the next two gates against
what `main` already ships, so we build the delta rather than rebuild.

## Current state on `main` (what already exists)

- **Profiles**: a donor profile at `app/admin/fundraising/donors/[id]/page.tsx`
  and a separate prospect detail at `prospects/[hubspot_id]/` (AI brief, score
  editor, deals, engagement timeline). The spec wants these to converge into one
  **Constituent 360**.
- **Activity timeline** (Epic C): unified donor activity already renders gifts +
  interactions on the donor profile.
- **`interactions`** table: `kind in ('call','email','meeting','event','note')`,
  `occurred_at`, `notes`, `logged_by`, plus `external_source/external_id`
  (HubSpot engagements import here, deduped). **Missing for email logging:**
  `direction`, `subject`, `thread_id`, `body_preview`, and a privacy flag.
- **Google integration**: `lib/google/auth.ts` + `lib/google/gmail.ts` —
  single-account OAuth as `remi@ambitionangels.org` via `GOOGLE_REFRESH_TOKEN`,
  currently scoped to `gmail.send` + calendar (for `/meet`). Reading mail needs
  the `gmail.readonly` scope added to that token.
- **Ongoing HubSpot sync** (#136) already lands engagements → interactions, so
  the timeline has CRM history; Gmail adds live, ongoing email.

So Gmail logging is the keystone net-new for 1C; the profile work is mostly
assembly + the email timeline + a next-move block.

---

## Phase 1C — Constituent 360 v1 + Gmail logging

### 1C.a — Data model (migration)

Extend `interactions` (chosen over a separate message store — same timeline,
one query path):

```
alter table interactions add column if not exists direction text
  check (direction in ('inbound','outbound'));   -- null for non-email
alter table interactions add column if not exists subject text;
alter table interactions add column if not exists thread_id text;     -- Gmail thread
alter table interactions add column if not exists body_preview text;  -- first ~500 chars, HTML-stripped
alter table interactions add column if not exists is_private boolean not null default false;
alter table interactions add column if not exists matched_email text; -- which address matched (audit)
```

`external_id` already holds the Gmail message id (idempotent ingest). Correcting
a mis-match = update `constituent_id`; hiding a thread = set `is_private`;
unlinking = set `constituent_id = null` (drops it off every profile).

### 1C.b — Gmail sync (the keystone)

A scheduled pull (cron route, mirroring `app/api/cron/*`) + a manual "Sync
email" trigger:

1. `gmail.users.messages.list` over the in-scope mailbox(es), windowed by
   `after:` since the last successful sync (store a cursor like `hs_sync_jobs`).
2. For each message, resolve the **counterparty** address (the non-staff side)
   and match it **only** to a constituent with that **verified email**
   (`constituents.emails`). No fuzzy name matching — a wrong attach is worse
   than a miss.
3. Insert an `interaction` (`kind='email'`, `direction`, `subject`,
   `thread_id`, `body_preview`, `matched_email`, `external_source='gmail'`,
   `external_id=<message id>`), idempotent on `(external_source, external_id,
   constituent_id)`.
4. **Exclusions (hard):** staff-to-staff email (both sides
   `@ambitionangels.org`); any message where the counterparty isn't a known
   constituent; messages under excluded labels (see decisions); personal/family
   — covered by the verified-address rule.

Privacy controls on the profile: mark thread **private** (hide), **unlink**
(remove from this constituent), **correct** (reassign to another constituent).
Bodies are previews only; full content stays in Gmail (link out by `thread_id`).

### 1C.c — Constituent 360 v1 (profile delta)

On the existing constituent profile, lead with the spec's four questions and add
the email timeline + next move. v1 does **not** force the prospect/donor route
collapse — it makes the constituent profile complete:

- **Lead block**: who they are, relationship (household/company), giving summary
  (lifetime + this year + last gift), and the **next move** (from the
  constituent's open opportunity `next_step` / `next_step_due`).
- **Email + interaction timeline**: merge Gmail-logged emails with existing
  interactions and gifts, newest first, with the private/unlink/correct
  controls.
- **Next-move block**: surface/create the next step with owner + due date.
- Works for any constituent (donor or not), so a prospect profile shows the same
  spine.

### 1C — acceptance (maps to the spec's cutover items 1–6)

A constituent shows correct contact, giving, and **email** history; a
mis-matched thread can be corrected/hidden; a note and a next move can be logged
on the profile.

---

## Phase 2 — Today's Fundraising Moves (operator home screen)

A new surface (`/admin/fundraising/today`, also feedable into the Command
Center) answering "who needs me today." Assembled from data we already have — no
new spine:

- Overdue next steps (opportunities `next_step_due < today`, open stages)
- Open asks nearing **expected close** (this is why the close forecast from #136
  matters)
- New gifts needing acknowledgment (`acknowledgment_status='pending'`)
- High-value prospects with no recent touch (score + last interaction)
- Warm prospects with **no owner**
- **Lapsed** donors worth recovering (LYBUNT/SYBUNT from retention)
- Upcoming meetings (from interactions/calendar)
- Recently engaged donors (engagement score deltas)

Each item is a card → deep-links to the Constituent 360. Optional **next-best-
action** agent (Sonnet, draft-then-approve) ranks/annotates; ships after the
deterministic queue works. Phase 2 acceptance: Remi/Shannon can run a day from
this screen.

---

## Build order

1. **1C.a** migration (interactions email columns) — small, safe.
2. **1C.b** Gmail sync (scope + privacy decided first) — the keystone.
3. **1C.c** Constituent 360 v1 (lead block + email timeline + next move).
4. **Phase 2** Today's Moves (deterministic queue), then the NBA agent.

## Decisions required before 1C.b (Gmail)

1. **Mailboxes in scope** — Remi only (matches current single-account auth), or
   add Shannon / a shared address (needs additional OAuth per mailbox).
2. **Label scope** — sync all mail and rely on verified-address matching, or
   restrict to/exclude specific Gmail labels (e.g. exclude a "Personal" label).
3. **History window** — how far back to backfill on first sync (e.g. 12 / 24
   months / all), then incremental forward.
4. **Privacy default** — log matched threads visible by default (operator hides
   sensitive ones), vs. private-by-default (operator reveals). Recommended:
   visible by default, with one-click hide + the hard exclusions above.
