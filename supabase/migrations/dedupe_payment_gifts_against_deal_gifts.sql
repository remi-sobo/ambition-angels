-- Gift-source reconciliation (specs/fundraising-v2.md): HubSpot closedwon deals
-- are the gift source of record (see fr_sync_hubspot_to_spine). Payments
-- (Stripe/Givebutter via the `donations` trigger) must therefore dedupe
-- AGAINST existing deal-gifts so a gift entered in HubSpot AND captured by a
-- payment processor is not counted twice.
--
-- fr_sync already guards the deal→gift direction (skips a deal-gift when a
-- payment gift exists). This redefines fr_ingest_donation to add the symmetric
-- guard: skip the payment gift when a deal-gift already covers it (same donor,
-- amount, gift_date within ±7 days). Identical body to create_fundraising_core
-- otherwise; only the guard before the gift insert is new.

create or replace function fr_ingest_donation(d donations)
returns void
language plpgsql
as $$
declare
  cid uuid;
  plan uuid;
  fname text;
  lname text;
begin
  if d.status is not null and d.status in ('failed','refunded') then
    return;
  end if;
  if d.stripe_payment_id is null or d.stripe_payment_id = '' then
    return;
  end if;

  if d.email is not null and d.email <> '' then
    perform pg_advisory_xact_lock(hashtext('constituent:' || d.org_id::text || ':' || lower(d.email)));
    select c.id into cid
    from constituents c
    where c.org_id = d.org_id
      and lower(d.email) = any (select lower(e) from unnest(c.emails) e)
    limit 1;

    if cid is null then
      fname := coalesce(d.first_name, nullif(split_part(coalesce(to_jsonb(d)->>'name', ''), ' ', 1), ''));
      lname := coalesce(d.last_name, nullif(substr(coalesce(to_jsonb(d)->>'name', ''), length(split_part(coalesce(to_jsonb(d)->>'name', ''), ' ', 1)) + 2), ''));
      insert into constituents (org_id, type, first_name, last_name, emails, source)
      values (d.org_id, 'person', fname, lname, array[lower(d.email)], 'stripe')
      returning id into cid;
    end if;
  end if;

  if d.recurring and d.subscription_id is not null and d.subscription_id <> '' then
    insert into recurring_plans (org_id, constituent_id, amount, frequency, external_source, external_id)
    values (d.org_id, cid, d.amount, 'monthly', 'stripe', d.subscription_id)
    on conflict (external_source, external_id) where external_id is not null
    do update set constituent_id = coalesce(recurring_plans.constituent_id, excluded.constituent_id)
    returning id into plan;
    if d.status = 'cancelled' then
      update recurring_plans set status = 'cancelled' where id = plan;
    end if;
    if cid is not null then
      update gifts set constituent_id = cid
      where recurring_plan_id = plan and constituent_id is null;
    end if;
  end if;

  -- Gift-source reconciliation: if a HubSpot deal-gift already covers this
  -- payment (same donor, amount, date ±7d), it is the record of truth — don't
  -- create a duplicate payment gift.
  if cid is not null and exists (
    select 1 from gifts g
    where g.constituent_id = cid
      and g.external_source = 'hubspot_deal'
      and g.amount = d.amount
      and abs(g.gift_date - (d.created_at at time zone 'utc')::date) <= 7
  ) then
    return;
  end if;

  insert into gifts (
    org_id, constituent_id, amount, gift_date, method,
    recurring_plan_id, external_source, external_id, acknowledgment_status
  )
  values (
    d.org_id, cid, d.amount, (d.created_at at time zone 'utc')::date, 'card',
    plan, 'stripe', d.stripe_payment_id,
    case when d.amount >= 250 then 'pending' else 'not_required' end
  )
  on conflict (external_source, external_id) where external_id is not null
  do nothing;
end;
$$;
