-- Comms v2.2 Phase G2 (specs/comms-v2-gmail-amendment.md): send queue,
-- scheduling and the per-minute worker. Pattern ported from the Team Esface
-- email engine (claim_email_messages / finish_email_campaigns).
--
-- email_sends becomes the queue: 'pending' rows wait, the worker claims them
-- ('sending'), and each ends sent | failed | unknown | skipped | suppressed.
-- 'unknown' means the provider gave no clear answer: it may have gone, so it
-- is never retried automatically (a Gmail send can't be safely repeated).
--
-- Apply BEFORE the G2 code deploy.

-- ── email_campaigns ─────────────────────────────────────────────────────────
alter table email_campaigns add column if not exists scheduled_at timestamptz;
alter table email_campaigns add column if not exists started_at timestamptz;
alter table email_campaigns add column if not exists finished_at timestamptz;
-- Who the segment matched but the send left out, and why: {doNotContact, suppressed, noEmail}.
alter table email_campaigns add column if not exists left_out jsonb not null default '{}'::jsonb;
alter table email_campaigns add column if not exists unknown_count int not null default 0;

alter table email_campaigns drop constraint if exists email_campaigns_status_check;
alter table email_campaigns add constraint email_campaigns_status_check
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'canceled'));

create index if not exists email_campaigns_due_idx
  on email_campaigns (scheduled_at) where status = 'scheduled';

-- ── email_sends ─────────────────────────────────────────────────────────────
alter table email_sends add column if not exists claimed_at timestamptz;
alter table email_sends add column if not exists provider_message_id text;
alter table email_sends add column if not exists attempt_count int not null default 0;
-- Snapshot of the merge data at queue time, so a send hours later says the
-- same thing the sender previewed.
alter table email_sends add column if not exists first_name text;

alter table email_sends drop constraint if exists email_sends_status_check;
alter table email_sends add constraint email_sends_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'skipped', 'suppressed'));

create index if not exists email_sends_pending_idx
  on email_sends (org_id, created_at) where status = 'pending';
create index if not exists email_sends_org_sent_idx
  on email_sends (org_id, status, sent_at);

-- ── permission: comms.send (decision D) ─────────────────────────────────────
-- Drafting stays fundraising.write; actually emailing donors needs comms.send.
-- finance and board_viewer can draft but not send.
insert into public.role_permissions (role, permission) values
  ('owner', 'comms.send'),
  ('admin', 'comms.send'),
  ('staff', 'comms.send')
on conflict do nothing;

-- ── queue functions (service role only) ─────────────────────────────────────

-- One tick of housekeeping, then the orgs that have work:
--   1. reap: a row a worker claimed over 15 minutes ago and never finished
--      becomes 'unknown' (the worker died mid-send; it may have gone).
--   2. open: scheduled campaigns whose time has come start sending.
--   3. return each org with pending rows in a sending campaign.
create or replace function public.comms_queue_tick()
returns setof uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.email_sends
     set status = 'unknown', error = 'The worker stopped mid-send. This email may have gone out.'
   where status = 'sending' and claimed_at < now() - interval '15 minutes';

  update public.email_campaigns
     set status = 'sending', started_at = coalesce(started_at, now()), updated_at = now()
   where status = 'scheduled' and scheduled_at <= now();

  return query
    select distinct s.org_id
      from public.email_sends s
      join public.email_campaigns c on c.id = s.campaign_id
     where s.status = 'pending' and c.status = 'sending';
end;
$$;

revoke execute on function public.comms_queue_tick() from public, anon, authenticated;
grant execute on function public.comms_queue_tick() to service_role;

-- Claim up to p_limit pending rows for one org, within what is left of its
-- daily cap (everything it sent, is sending, or may have sent in the last 24
-- hours counts). skip locked keeps two overlapping workers from taking the
-- same row.
create or replace function public.claim_email_sends(p_org uuid, p_limit int)
returns setof public.email_sends
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_cap int;
  v_used int;
  v_take int;
begin
  select coalesce(s.daily_send_cap, 400) into v_cap
    from public.org_comms_settings s where s.org_id = p_org;
  if v_cap is null then
    return;
  end if;

  select count(*) into v_used
    from public.email_sends m
   where m.org_id = p_org
     and m.status in ('sent', 'sending', 'unknown')
     and coalesce(m.claimed_at, m.sent_at) > now() - interval '24 hours';

  v_take := least(greatest(coalesce(p_limit, 0), 0), 100, greatest(v_cap - v_used, 0));
  if v_take <= 0 then
    return;
  end if;

  return query
    update public.email_sends m
       set status = 'sending', claimed_at = now(), attempt_count = m.attempt_count + 1
     where m.id in (
       select q.id
         from public.email_sends q
         join public.email_campaigns c on c.id = q.campaign_id
        where q.org_id = p_org and q.status = 'pending' and c.status = 'sending'
        order by q.created_at, q.id
        limit v_take
        for update of q skip locked)
    returning m.*;
end;
$$;

revoke execute on function public.claim_email_sends(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_email_sends(uuid, int) to service_role;

-- Refresh the counts on every sending campaign, then close the ones with
-- nothing left pending or in a worker's hands.
create or replace function public.finish_email_campaigns()
returns int
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  n int;
begin
  update public.email_campaigns c
     set sent_count = t.sent, failed_count = t.failed, unknown_count = t.unknown, updated_at = now()
    from (
      select s.campaign_id,
             count(*) filter (where s.status = 'sent') as sent,
             count(*) filter (where s.status in ('failed', 'skipped', 'suppressed')) as failed,
             count(*) filter (where s.status = 'unknown') as unknown
        from public.email_sends s
        join public.email_campaigns c2 on c2.id = s.campaign_id
       where c2.status in ('sending', 'canceled')
       group by s.campaign_id
    ) t
   where c.id = t.campaign_id;

  update public.email_campaigns c
     set status = 'sent', finished_at = now(), sent_at = coalesce(c.sent_at, now()), updated_at = now()
   where c.status = 'sending'
     and not exists (select 1 from public.email_sends s
                      where s.campaign_id = c.id and s.status in ('pending', 'sending'));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.finish_email_campaigns() from public, anon, authenticated;
grant execute on function public.finish_email_campaigns() to service_role;
