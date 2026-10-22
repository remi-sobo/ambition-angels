-- AI thank-you drafts in the Needs-you popout (specs/needs-you-popout-thank-
-- yous.md, PR 4): seed data only, no DDL.
--
--   * ai.ack_draft entitlement, on for AA and YGB (decision 3). The draft
--     route 402s and the popout hides the Draft button without it.
--   * AA's voice in orgs.settings.ack_voice (signer, tone, style rules,
--     mission line). Voice is data per org; an org without it drafts in its
--     own name with a neutral tone (lib/agents/ack-draft/prompt.ts).
--
-- Orgs resolved by slug like capture_tables.sql; a no-op where the slugs are
-- absent (the RLS scratch DB). Idempotent: upsert the entitlement, merge the
-- voice key into settings without touching the other settings keys.
-- Apply before PR 4's route deploys (seed before gate).
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

insert into public.org_entitlements (org_id, feature_key, enabled, source)
select o.id, 'ai.ack_draft', true, 'seed:ack_draft'
from public.orgs o
where o.slug in ('ambition-angels', 'young-gifted-black')
on conflict (org_id, feature_key)
  do update set enabled = true, source = excluded.source, updated_at = now();

update public.orgs
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'ack_voice', jsonb_build_object(
        'signer_name', 'Remi Sobomehin',
        'signer_title', 'Founder and CEO',
        'tone_notes', 'Warm, direct, founder-to-supporter. Short sentences. Zero fundraising-speak.',
        'style_rules', 'No em dashes. Use contractions. Specific over vague. No "transformative," "pivotal," "holistic," "seamless." One clear sentence of what the gift makes possible, without numbers that aren''t in the facts.',
        'mission_line', 'Ambition Angels delivers real careers through free 30-day simulated internships, in the classroom on the web and in their pocket on the phone.'
      )
    ),
    updated_at = now()
where slug = 'ambition-angels';
