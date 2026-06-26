-- Grant Shannon owner-level access (admin → owner) for full parity with Remi.
--
-- Background: in role_permissions, the 'admin' and 'owner' rows already carry an
-- identical permission set (create_bloomos_core.sql). The only thing reserved
-- for 'owner' is billing/destructive org actions, described there as
-- "app-enforced". To give Shannon unambiguous, future-proof parity with the
-- owner — including any owner-only gate added later — we promote her membership
-- from 'admin' to 'owner' rather than relying on admin==owner staying true.
--
-- Idempotent and scoped: only the ambition-angels membership for
-- shannon@ambitionangels.org, and only if not already owner.

update public.memberships m
set role = 'owner'
from auth.users u, public.orgs o
where m.user_id = u.id
  and m.org_id = o.id
  and lower(u.email) = 'shannon@ambitionangels.org'
  and o.slug = 'ambition-angels'
  and m.role is distinct from 'owner';
