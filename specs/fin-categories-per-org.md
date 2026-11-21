# Finance categories per org

Fixes V4 Phase 0 audit P0 finding 5 and operator action O8. Migration: `supabase/migrations/fin_categories_org_scope.sql`. **The owner must approve it before it is applied to production.**

## Current schema

- `fin_categories`: `primary key (id)`, a global text id. `org_id` is NOT NULL with an AA default (from `add_org_id_to_tenant_tables`).
- References to a category id:
  - `fin_budget.category_id`: FK `on delete restrict`, `primary key (year, category_id)`
  - `fin_transactions.category_id`: FK `on delete set null`
  - `fin_category_rules.category_id`: FK `on delete cascade`
- No views or functions read these tables (checked with `pg_depend`/`pg_proc` on a scratch DB). Forecast, reports and `aa.finance_model` do not key on categories.
- RLS on all four uses `has_permission(org_id, 'finance.read'/'finance.write')`.

So a second org can't own an id AA already uses, a row in org B can reference AA's category, and two orgs can't budget the same id in the same year. Worse, `budget` upserts `onConflict: "year,category_id"`, so org B could overwrite AA's budget row.

## Design

Keep the text ids and scope them by org. This is the smallest change: no id rewrites and no new surrogate keys.

1. Preflight: abort with counts if any budget, transaction or rule row points at a category that doesn't exist in its own org.
2. Back-fill `org_id` from the AA org, resolved by slug, only where it is null. This is a no-op today, and is skipped if the org is absent.
3. Drop the three global FKs.
4. Change `fin_categories` to `primary key (org_id, id)` and `fin_budget` to `primary key (org_id, year, category_id)`.
5. Add composite FKs `(org_id, category_id) → fin_categories(org_id, id)`. On delete, budget restricts, rules cascade, and transactions use `set null (category_id)`.
6. Drop the `org_id` defaults on `fin_categories`, `fin_budget` and `fin_category_rules`. RLS is unchanged.
7. Add `(org_id, category_id)` indexes on transactions and rules.
8. Add `fin_seed_starter_categories(org uuid)`: 34 generic nonprofit categories, idempotent. Only an operator can run it (EXECUTE is revoked from anon and authenticated).

Every step checks the current shape first, so the migration is idempotent. `create_fin_schema.sql`'s legacy seed now runs only on a fresh DB, because its old conflict targets no longer exist.

App changes:
- Budget upserts conflict on `org_id,year,category_id`.
- Every write that takes a category id checks it against the caller's org first (`lib/finance/categories.ts`).
- "Seed default rules" inserts only the rules whose category exists in the org.
- A new org with no categories sees an empty state on budget, rules and transactions instead of an error.

## Ambition Angels

Its rows already carry AA's `org_id` and no ids change, so every amount, budget line, rule and report stays the same. On a scratch DB with 2,000 transactions, a second org and rules, before/after checksums of categories, budget, per-category transaction sums and rules were identical.

## Preflight (run first, read-only)

```sql
select 'budget', count(*) from fin_budget b where not exists (select 1 from fin_categories c where c.org_id=b.org_id and c.id=b.category_id)
union all select 'txn', count(*) from fin_transactions t where t.category_id is not null and not exists (select 1 from fin_categories c where c.org_id=t.org_id and c.id=t.category_id)
union all select 'rules', count(*) from fin_category_rules r where not exists (select 1 from fin_categories c where c.org_id=r.org_id and c.id=r.category_id);
```

All three should be 0. The likeliest non-zero is rules that a non-AA org created with "Seed default rules" (they point at AA's ids). Delete those rules, then apply.

## New org

An operator runs `select fin_seed_starter_categories((select id from orgs where slug='<slug>'));`. A UI for creating categories is still out of scope.

## Rollback

Only possible while each id is unique across orgs (true until a second org reuses one):

```sql
alter table fin_budget drop constraint fin_budget_category_fkey;
alter table fin_transactions drop constraint fin_transactions_category_fkey;
alter table fin_category_rules drop constraint fin_category_rules_category_fkey;
alter table fin_budget drop constraint fin_budget_pkey, add primary key (year, category_id);
alter table fin_categories drop constraint fin_categories_pkey, add primary key (id);
alter table fin_budget add foreign key (category_id) references fin_categories(id) on delete restrict;
alter table fin_transactions add foreign key (category_id) references fin_categories(id) on delete set null;
alter table fin_category_rules add foreign key (category_id) references fin_categories(id) on delete cascade;
drop function fin_seed_starter_categories(uuid);
```

You must also revert the app commit. Restoring the org_id defaults is optional.

## Risks

- Deploy window: between applying the migration and deploying this code, the old code's budget upsert (`year,category_id`) fails. Apply the migration and merge in the same sitting.
- The column-list `SET NULL` needs Postgres 15 or later. The migration checks the version and aborts on anything older.
- The `ALTER`s take short exclusive locks on four small tables.
- Any writer that relied on the dropped defaults now fails loudly. All app writers pass `org_id`.
