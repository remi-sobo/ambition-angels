-- Operating Spine — Phase 4: per-user, per-org UI state (specs: BloomOS V3 #1).
--
-- user_org_state carries last_seen_at, which powers the deterministic
-- "changed since you were last here" diff and the Command Center verdict.
-- Its own table, NOT a column on memberships (spec open decision C):
-- memberships is an identity/authorization row and stays stable; per-user UI
-- state (last seen, future dismissals/queue preferences) grows here without
-- touching the auth path.
--
-- prev_seen_at anchors the diff window: last_seen_at bumps on every Command
-- Center load, and prev_seen_at only rolls forward when the previous visit
-- was a real absence (app-side session-gap rule), so refreshing the page
-- doesn't collapse "since you were last here" to "since ten seconds ago".
--
-- NO org_id default — the ops_tasks '17c75da8-…' default trap is exactly what
-- this spec must not copy. Both keys always come from session context; a row
-- inserted without them fails, it never silently lands in the resident org.

create table if not exists public.user_org_state (
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references public.orgs(id) on delete cascade,
  last_seen_at timestamptz,
  prev_seen_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, org_id)
);

drop trigger if exists user_org_state_set_updated_at on public.user_org_state;
create trigger user_org_state_set_updated_at
  before update on public.user_org_state
  for each row execute function public.set_updated_at();

alter table public.user_org_state enable row level security;

-- Self-only, membership-bound: a user reads and writes exactly their own row,
-- and only inside an org they belong to. No cross-user reads (this is private
-- UI state), no way to park state in a foreign tenant.
drop policy if exists "own user_org_state" on public.user_org_state;
create policy "own user_org_state" on public.user_org_state
  for all to authenticated
  using ( user_id = (select auth.uid()) and (select private.is_org_member(org_id)) )
  with check ( user_id = (select auth.uid()) and (select private.is_org_member(org_id)) );
