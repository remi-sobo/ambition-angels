# Rebuilding the tenant-isolation scan (proposal, not built)

Recorded 2026-09-03. The current guard, `tests/tenant-isolation.test.ts`, is
a regex over source files: it finds `.from("<tenant table>")` on a client it
can prove was created by `getSupabaseAdmin()` in the same file, takes the
statement text up to the next semicolon, and passes it if the substring
`org_id` appears anywhere in it. Two cross-tenant leaks shipped under it, and
a repo-wide run finds 62 further unfenced reads outside its roots. That is a
floor, because of what it cannot see at all.

## Why it is not a guard

| Blind spot | What gets through |
|---|---|
| Client factory tracked per file only | 43 files receive a `SupabaseClient` as a parameter (`lib/fundraising/gmail-sync.ts`, `lib/meetings/*`, `lib/briefing.ts`, `lib/admin/plan/metrics.ts`, …). Every read in them is invisible. |
| Substring test for `org_id` | `.select("org_id, title")` with no `.eq("org_id", …)` passes. A comment mentioning org_id passes. |
| `.rpc()` calls ignored | 12 call sites, including `fr_sync_hubspot_to_spine`, `fr_backfill_constituent_names_from_hubspot`, `bloomos_search_people`, `hubspot_bench_candidates`, `has_permission`, `can_view_staff`. Several are SECURITY DEFINER; the fence, if any, is inside the SQL body. |
| Storage and auth reads ignored | `getSupabaseAdmin().storage.from(...).download(...)` (Reed `read_document`, report photos) and `auth.admin.getUserById` are not `.from("<table>")`. |
| Views | `ms_catalog` has no `security_invoker`; a view without it runs as owner and bypasses RLS for the session client too. The scan does not look at views. |
| Roots | Until #455 it did not scan `app/api/cron`; until #459 it did not scan the external surfaces. Anything under `app/api/*` not explicitly listed, and `lib/*` outside `admin`, `email`, `notifications`, is still out. |

## What a real one needs

1. **Resolve clients across calls.** Parse with the TypeScript compiler API
   (or ts-morph), not regex. Mark `getSupabaseAdmin()` results and every
   parameter annotated `SupabaseClient` whose call sites pass a service-role
   client as *service-role*. Reads on `createServerSupabase()` remain RLS-safe
   and are skipped. Ambiguity (a parameter that receives both) is a finding,
   not a skip.
2. **Check the filter, not the substring.** A read is fenced only when the
   chain contains `.eq("org_id", <expr>)` or `.in("org_id", <expr>)` before
   the terminal call, or the table is in the global allow-list. Inserts and
   upserts are fenced only when the row literal or every element of the row
   array carries an `org_id` key.
3. **Treat `.rpc()` as unfenced unless proven.** Resolve the function name to
   `supabase/migrations/*.sql`; pass it only if the body either takes an org
   parameter that every read uses, or is SECURITY INVOKER and reads only
   RLS-enabled tables. Anything else fails with the function name.
4. **Cover storage and auth.** `storage.from(bucket).download(path)` is fenced
   only when the preceding row lookup on `documents` (or the bucket's owning
   table) was itself fenced in the same function. `auth.admin.getUserById`
   results must be paired with a `memberships` check on the target org before
   any send, as `notify()` now does.
5. **Fail on views.** Every view in `public` that selects from a tenant table
   must carry `security_invoker`; `ms_catalog` is the one that does not today
   and needs either the option or an explicit allow entry with a reason.
6. **Whole-repo roots, explicit allow-list.** Scan all of `app/`, `lib/`,
   `components/`, `supabase/functions/`. Public-funnel tables stay in
   `GLOBAL_ALLOW`. File-level exceptions require a reason and expire: the
   test fails if an exception's reason is older than a set date.
7. **Output that names the fix.** Each finding prints file, line, table, the
   client's provenance chain, and the missing filter, so the fix is mechanical.

## What the 62 findings would become

The repo-wide run groups into: `lib/messaging/threads.ts` (20, by thread id;
membership is the fence, org is knowable from the thread), HubSpot sync in/out
(12, by constituent id; org knowable from the row), `lib/agenda/*` (6, by
calendar event), `lib/google/connection.ts` (5), `lib/availability.ts` and the
public meet/ygb/apply routes (16, public-funnel tables or token-addressed
rows), and the MCP read fixed in #459. Under the rebuilt scan, roughly a
third are real fixes of the `.eq("org_id", …)` kind, a third move to the
public-funnel allow-list with a reason, and a third are token-addressed rows
where the token is the fence and belong on an expiring exception.

## Cost

Two to three days: one for the TypeScript-API resolver, one for the rpc and
view checks, and the remainder for working the findings list down to zero.
Not started; this document is the proposal.
