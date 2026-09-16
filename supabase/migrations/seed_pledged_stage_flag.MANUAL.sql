-- Seed: pipeline_stages.counts_as_pledged (specs/fundraising-gift-tables.md).
--
-- MANUAL, not part of the migration chain: this is a data seed over rows that
-- already exist per tenant, run by hand in the Supabase SQL editor after
-- fundraising_gift_tables.sql adds the column. Same convention as the other
-- *.MANUAL.sql files — scripts/test-rls.sh and the migration-ledger check
-- both skip them.
--
-- WHY A FLAG AND NOT A KEY. "Pledged" means the donor has committed and the
-- money has not landed. Today three places in the codebase assert that by
-- hardcoding AA's shape:
--   lib/fundraising/stage-sets.ts     the literal 'pledged' in OPEN_STAGE_KEYS
--   PledgesSection.tsx                .in("stage", [...WON_STAGE_LIST, "pledged"])
--   v_revenue_schedule                external_stage in ('3448542950','59189578')
-- The third is a live tenant-neutrality bug: it identifies pledged money by
-- HubSpot dealstage id, so a standalone tenant's pledged asks never reach
-- finance runway or Horizon. This flag is what makes that fixable — moving
-- that view onto it is a follow-up PR, not this one.
--
-- Idempotent: an UPDATE guarded on the current value, safe to re-run.

update public.pipeline_stages
set counts_as_pledged = true
where key = 'pledged'
  and counts_as_pledged is distinct from true;

-- Verify: every tenant's pledged stage carries the flag, and nothing else does.
--
-- select o.slug, ps.pipeline, ps.key, ps.stage_type, ps.counts_as_pledged
--   from public.pipeline_stages ps
--   join public.orgs o on o.id = ps.org_id
--  where ps.counts_as_pledged
--  order by o.slug;
--
-- Expect (2026-09-16): 4 rows — ambition-angels, safespace, young-gifted-black,
-- young-life-epa — each pipeline 'default', key 'pledged', stage_type 'open'.
--
-- A tenant provisioned later gets the flag from its own stage seed:
-- supabase/seed/ygb_demo_tenant.sql and the block in
-- specs/younglife-epa-tenant-onboarding.md both set it inline. If a new org
-- ever appears without it, the gift table page says "no pledged stage
-- configured" rather than silently showing pledged asks as ordinary open ones.
