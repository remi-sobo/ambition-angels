-- Acknowledgments v2 (Stewardship) — Phase 4: seed Ambition Angels' matrix.
--
-- The stewardship matrix is data, not code, so AA's policy lives here as rows in
-- stewardship_rules (and a few starter ack_templates the rules point at). A
-- second tenant seeds its own rows and gets its own behavior; nothing here
-- leaks AA's org into another tenant because org_id is resolved by slug.
--
-- Policy (first match wins, by rank):
--   10  first gift            -> personal welcome call task (Shannon), draft note
--   20  major gift $1,000+    -> call task (Remi), 24h
--   30  in-kind gift          -> letter task (Shannon), 72h
--   40  $250+ (IRS receipt)   -> personal email task (Shannon), 48h
--   50  anything else, recent -> auto-send the compliant receipt, no task
--   (older than 30 days matches nothing -> none -> not_required; this keeps
--    historical imports and backfill off the human queue)
--
-- Idempotent: re-running is a no-op once AA has any stewardship_rules.

do $$
declare
  aa uuid;
  tpl_email uuid;
  tpl_call uuid;
  tpl_letter uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  if exists (select 1 from stewardship_rules where org_id = aa) then
    raise notice 'stewardship_rules already seeded for AA — skipping';
    return;
  end if;

  insert into ack_templates (org_id, name, subject_type, channel, subject, body, is_default)
  values (
    aa, 'Default gift thank-you', 'gift', 'email',
    'Thank you for your gift to Ambition Angels',
    'Hi {{first_name}},' || chr(10) || chr(10) ||
    'Thank you so much for your generous gift. Your support directly funds the students and programs at the heart of Ambition Angels, and it means the world to us.' || chr(10) || chr(10) ||
    'With gratitude,' || chr(10) || 'The Ambition Angels team',
    true
  )
  returning id into tpl_email;

  insert into ack_templates (org_id, name, subject_type, channel, subject, body, is_default)
  values (
    aa, 'First-gift welcome call script', 'gift', 'call', null,
    'Call {{first_name}} to say thank you personally. Mention how their first gift fuels a specific student program, ask what drew them to give, and note anything worth following up on.',
    true
  )
  returning id into tpl_call;

  insert into ack_templates (org_id, name, subject_type, channel, subject, body, is_default)
  values (
    aa, 'Major-gift letter', 'gift', 'letter', null,
    'Dear {{first_name}},' || chr(10) || chr(10) ||
    'Thank you for your extraordinary generosity to Ambition Angels. A gift of this size changes what we can offer the students we serve, and we are grateful to have you alongside us.' || chr(10) || chr(10) ||
    'With deep gratitude,' || chr(10) || 'The Ambition Angels team',
    true
  )
  returning id into tpl_letter;

  insert into stewardship_rules
    (org_id, name, rank, conditions, action, channel, template_id, sla_hours, assignee, active)
  values
    (aa, 'First gift, personal welcome call', 10,
     '{"first_gift": true, "max_age_days": 30}'::jsonb,
     'create_task_and_draft', 'call', tpl_call, 48, 'shannon', true),
    (aa, 'Major gift $1,000+, Remi calls', 20,
     '{"min_amount": 1000, "max_age_days": 30}'::jsonb,
     'create_task', 'call', tpl_call, 24, 'remi', true),
    (aa, 'In-kind gift, letter', 30,
     '{"methods": ["in_kind"], "max_age_days": 30}'::jsonb,
     'create_task', 'letter', tpl_letter, 72, 'shannon', true),
    (aa, 'Receipt-required gift $250 and up, personal email', 40,
     '{"min_amount": 250, "max_age_days": 30}'::jsonb,
     'create_task', 'email', tpl_email, 48, 'shannon', true),
    (aa, 'Smaller recent gift, auto receipt', 50,
     '{"min_amount": 0.01, "max_age_days": 30}'::jsonb,
     'auto_email', 'email', tpl_email, 0, null, true);
end $$;
