-- Comms v2.2 Phase G3 (specs/comms-v2-gmail-amendment.md): open and click
-- tracking, for the per-campaign results page.
--
-- Every queued email gets a random tracking_token. The public routes
-- /api/t/o/[token] (open pixel) and /api/t/c/[token]/[n] (click redirect)
-- find the send by token only. Nothing about the reader (address, IP, agent)
-- is stored. Opens are approximate: Apple Mail and Gmail load images ahead of
-- time, so the UI says "about".
--
-- Apply BEFORE the G3 code deploy.

alter table email_sends add column if not exists tracking_token text;
create unique index if not exists email_sends_tracking_token_key
  on email_sends (tracking_token) where tracking_token is not null;
alter table email_sends add column if not exists open_count int not null default 0;
alter table email_sends add column if not exists first_opened_at timestamptz;
alter table email_sends add column if not exists click_count int not null default 0;
alter table email_sends add column if not exists first_clicked_at timestamptz;

create table if not exists email_link_clicks (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id),
  send_id uuid not null references email_sends(id) on delete cascade,
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  link_index int not null,
  url text not null,
  clicked_at timestamptz not null default now()
);
create index if not exists email_link_clicks_campaign_idx on email_link_clicks (campaign_id);
create index if not exists email_link_clicks_org_idx on email_link_clicks (org_id);

alter table public.email_link_clicks enable row level security;
drop policy if exists "members read email_link_clicks" on public.email_link_clicks;
create policy "members read email_link_clicks" on public.email_link_clicks
  for select to authenticated
  using ( (select private.has_permission(org_id, 'fundraising.read')) );
-- No write policy: only the service-role tracking routes write here.

-- Count an open on a real, sent email. Returns whether one was found.
create or replace function public.record_email_open(p_token text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  n int;
begin
  update public.email_sends
     set open_count = open_count + 1,
         first_opened_at = coalesce(first_opened_at, now())
   where tracking_token = p_token and status in ('sent', 'unknown');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Count a click and log which link. The URL comes from the caller, which
-- derives it from the stored campaign body, never from the request.
create or replace function public.record_email_click(p_token text, p_index int, p_url text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_send public.email_sends%rowtype;
begin
  update public.email_sends
     set click_count = click_count + 1,
         first_clicked_at = coalesce(first_clicked_at, now()),
         -- A click proves the email was opened, even with images off.
         open_count = greatest(open_count, 1),
         first_opened_at = coalesce(first_opened_at, now())
   where tracking_token = p_token and status in ('sent', 'unknown')
  returning * into v_send;
  if not found then
    return false;
  end if;
  insert into public.email_link_clicks (org_id, send_id, campaign_id, link_index, url)
  values (v_send.org_id, v_send.id, v_send.campaign_id, p_index, left(p_url, 2000));
  return true;
end;
$$;

revoke execute on function public.record_email_open(text) from public, anon, authenticated;
revoke execute on function public.record_email_click(text, int, text) from public, anon, authenticated;
-- service_role only exists on the Supabase platform, not the scratch runner.
do $$ begin
  grant execute on function public.record_email_open(text) to service_role;
  grant execute on function public.record_email_click(text, int, text) to service_role;
exception when undefined_object then null; end $$;
