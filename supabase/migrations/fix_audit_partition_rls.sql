-- Enable RLS on existing audit_log partitions (PostgREST exposes child
-- partitions directly; the parent's policies don't apply to direct child
-- queries) and re-schedule the rotation job so future partitions are
-- created protected from birth. No policies on the children on purpose:
-- org admins read via the parent.

do $$
declare p text;
begin
  for p in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class parent on parent.oid = i.inhparent
    where parent.relname = 'audit_log'
  loop
    execute format('alter table public.%I enable row level security', p);
  end loop;
end $$;

select cron.unschedule('audit-log-partitions')
  where exists (select 1 from cron.job where jobname = 'audit-log-partitions');
select cron.schedule(
  'audit-log-partitions',
  '0 3 25 * *',
  $cron$
  do $$
  declare
    nxt date := date_trunc('month', now() + interval '1 month')::date;
    old date := date_trunc('month', now() - interval '12 months')::date;
  begin
    execute format(
      'create table if not exists audit_log_%s partition of audit_log
         for values from (%L) to (%L)',
      to_char(nxt, 'YYYY_MM'), nxt, nxt + interval '1 month');
    execute format('alter table audit_log_%s enable row level security',
      to_char(nxt, 'YYYY_MM'));
    execute format('drop table if exists audit_log_%s',
      to_char(old, 'YYYY_MM'));
  end $$;
  $cron$
);
