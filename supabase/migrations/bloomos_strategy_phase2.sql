-- BloomOS Strategy, Phase 2 (specs/bloomos-strategy.md) — the cascade.
-- An ops project can attach to a strategic initiative. This is the ONLY
-- strategic link: the work rollup flows task -> project -> initiative -> goal
-- -> objective through initiative_id. `category` stays a loose ops tag with no
-- role in the rollup (the recon proved the 8 categories don't map to the 4
-- objectives).
--
-- Nullable on purpose: strategic work attaches to an initiative; keep-the-
-- lights-on work doesn't and rolls up nowhere. ON DELETE SET NULL so deleting
-- an initiative detaches its projects rather than destroying ops history.
--
-- Additive only — safe to apply before the Phase 2 code deploys. (This does not
-- touch the ops_projects org_id default; that's an ops-module concern, out of
-- scope for the strategy cascade.)

alter table ops_projects
  add column if not exists initiative_id uuid references plan_initiatives(id) on delete set null;

create index if not exists ops_projects_initiative_idx on ops_projects (initiative_id);
