-- BloomOS V2 / Spec B, stage B3 — the per-user V2 shell flag.
-- (specs/bloomos-v2-spec-b-shell.md, open decision 1: per-user, as
--  recommended, so Remi and Shannon can run V2 while external tenants stay
--  on V1.)
--
-- Additive: one nullable boolean on profiles, no default (NULL = off = V1).
-- Writes go through the session client at /admin/v2; the existing "write own
-- profile" RLS policy already restricts them to the user's own row, and the
-- reader (lib/admin/v2shell.ts) tolerates the column being absent, so code
-- and migration can ship in either order.

alter table public.profiles
  add column if not exists v2_shell boolean;

comment on column public.profiles.v2_shell is
  'Spec B (B3): true = this user sees the V2 shell on /admin; NULL/false = V1. Per-user by design (open decision 1). Flipped at /admin/v2.';

-- ── rollback (reference only; never applied automatically) ──────────────────
-- alter table public.profiles drop column if exists v2_shell;
