-- BloomOS V2 / Spec Finance, stage N2 — seed aa.finance_model for AA.
--
-- The founder finance model (/admin/finance/model, absorbed into Forecast at
-- N2) reads a single env-configured Google Sheet: AA's cash, burn, runway,
-- and funding-needed numbers, with no org in the data path. Before this key
-- existed, ANY org holding modules.finance could open the page and see AA's
-- numbers — a cross-tenant leak the Forecast absorption would have promoted
-- from an unlisted URL to a tab. N2 fences the section (embedded and
-- standalone) behind this entitlement; this seed grants it to AA so the fix
-- changes nothing for the tenant that owns the sheet.
--
-- Data, not code: AA resolved by slug like every entitlement seed — no
-- hardcoded org uuid, and a no-op against a DB where the org isn't present
-- (e.g. the RLS scratch DB).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'aa.finance_model', true, 'seed:spec_fin_n2'
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();
