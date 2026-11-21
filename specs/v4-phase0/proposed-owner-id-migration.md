# Proposed migration: owner on donors, asks, cohorts and programs

Status: **waiting on Remi's yes.** Not applied. Not in `supabase/migrations/` yet, because the ledger check fails on any committed migration that production has not applied.

## Why

Spec section 12 (Assignment) and decision 3. Today's panels and "mine" saved views need to know whose a record is. Today:

| Table | Owner today |
|---|---|
| `constituents` (donors and funders) | none |
| `asks` | `owner` free text, set on all 30 rows, 6 distinct values |
| `opportunities` | `owner` free text, set on 102 of 692 rows, 9 distinct values |
| `cohorts` | none |
| `programs` | none |

## What it does

- Adds a nullable `owner_id uuid` to `constituents`, `asks`, `cohorts` and `programs`. It references `auth.users(id)` with `on delete set null`, so removing a person never deletes their records.
- Adds an index on `(org_id, owner_id)` for each table, for "mine" views.
- Changes no existing column. The free-text `owner` stays, and the app shows it until an `owner_id` is set.
- Backfills nothing in the migration. A later, separate step can match the free-text names to members, and you'd see that list first.
- Adds no database default. The app sets the creator as owner on new records, and a bulk "Assign to" action sets it on existing ones.
- Changes no RLS. Ownership decides what shows up as "mine". It does not decide who can see a record.

## SQL

```sql
alter table public.constituents add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.asks         add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.cohorts      add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.programs     add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists constituents_org_owner_idx on public.constituents (org_id, owner_id);
create index if not exists asks_org_owner_idx         on public.asks (org_id, owner_id);
create index if not exists cohorts_org_owner_idx      on public.cohorts (org_id, owner_id);
create index if not exists programs_org_owner_idx     on public.programs (org_id, owner_id);
```

## Risk

- Low. Adding nullable columns and indexes doesn't rewrite rows or block reads.
- The four tables are small. The largest is `constituents`, with a few hundred rows per org.
- To roll back, drop the four columns.

## Open question

`opportunities` (the grants pipeline) also has a free-text owner. Should it get `owner_id` in the same migration? The recommendation is yes, for one consistent rule, but it's not in the spec's list, so it's left out until you say.
