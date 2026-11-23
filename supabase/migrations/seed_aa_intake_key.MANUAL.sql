-- Manual seed: Ambition Angels' website intake key (specs/bloomos-repo-split.md §6a).
--
-- Run by hand, once, after create_org_api_keys_intake.sql is applied. Not part
-- of the migration chain (the ledger check and the RLS test skip *.MANUAL.sql).
--
-- The raw key never appears in this file, in chat, or in the repo. To mint one:
--
--   1. On the operator's machine:
--        node -e "const {generateApiKey}=require('./lib/intake/keys');" ...
--      or any equivalent that produces  bos_live_<40 base64url chars>  and its
--      sha256 hex. Keep the raw key in a temp file, never on screen.
--   2. Put the raw key straight into the Ambition Angels Vercel project as
--      BLOOMOS_INTAKE_KEY (dashboard, or `vercel env add` reading the file).
--   3. Run this file with the hash and the 17-char display prefix substituted:
--        psql "$DB" -v key_hash=<sha256 hex> -v key_prefix=<bos_live_xxxxxxxx> \
--             -f supabase/migrations/seed_aa_intake_key.MANUAL.sql
--   4. Delete the temp file.
--
-- To rotate: mint a new key the same way, swap the Vercel env var, redeploy
-- the website, then set revoked_at on the old row.

insert into public.org_api_keys (org_id, name, key_prefix, key_hash, scopes)
select o.id,
       'ambitionangels.org website',
       :'key_prefix',
       :'key_hash',
       array['intake:forms', 'intake:donations']
from public.orgs o
where o.slug = 'ambition-angels'
on conflict (key_hash) do nothing;
