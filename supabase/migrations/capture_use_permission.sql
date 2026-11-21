-- BloomOS V4: voice for every role (approved by Remi 2026-11-21: "voice is
-- important for everyone").
--
-- Until now the captures / capture_cards policies (capture_tables.sql) asked
-- for ops.read to read and ops.write to write, so finance and board_viewer
-- members got no Talk to log at all. This adds a permission of its own,
-- capture.use, granted to all five roles, and moves the eight policies onto
-- it. Every policy still requires created_by = auth.uid(): a recording and
-- its cards stay PERSONAL, readable and writable only by the person who made
-- them. Nothing else changes:
--   * filing a card still needs the destination's own permission, enforced
--     by the destination table's RLS (interactions / partner_interactions /
--     ops_tasks / reed_drafts and capture_drafts_permission.sql) and by the
--     app's pre-check, so a board viewer can record but files nothing;
--   * the ai.capture entitlement is still the org's switch.
--
-- Idempotent: the seed is insert ... on conflict do nothing, and each policy
-- is dropped if it exists and re-created with the same name.
-- Apply AFTER capture_tables.sql. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- ── permission: capture.use ────────────────────────────────────────────────
insert into public.role_permissions (role, permission) values
  ('owner', 'capture.use'),
  ('admin', 'capture.use'),
  ('staff', 'capture.use'),
  ('finance', 'capture.use'),
  ('board_viewer', 'capture.use')
on conflict do nothing;

-- ── captures ───────────────────────────────────────────────────────────────
drop policy if exists "owner reads captures" on public.captures;
create policy "owner reads captures" on public.captures
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner inserts captures" on public.captures;
create policy "owner inserts captures" on public.captures
  for insert to authenticated
  with check (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner updates captures" on public.captures;
create policy "owner updates captures" on public.captures
  for update to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  )
  with check (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner deletes captures" on public.captures;
create policy "owner deletes captures" on public.captures
  for delete to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

-- ── capture_cards ──────────────────────────────────────────────────────────
drop policy if exists "owner reads capture_cards" on public.capture_cards;
create policy "owner reads capture_cards" on public.capture_cards
  for select to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner inserts capture_cards" on public.capture_cards;
create policy "owner inserts capture_cards" on public.capture_cards
  for insert to authenticated
  with check (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner updates capture_cards" on public.capture_cards;
create policy "owner updates capture_cards" on public.capture_cards
  for update to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  )
  with check (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );

drop policy if exists "owner deletes capture_cards" on public.capture_cards;
create policy "owner deletes capture_cards" on public.capture_cards
  for delete to authenticated
  using (
    (select private.has_permission(org_id, 'capture.use'))
    and created_by = (select auth.uid())
  );
