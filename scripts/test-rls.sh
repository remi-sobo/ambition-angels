#!/usr/bin/env bash
# Cross-tenant RLS leak test (BloomOS Ring 1).
#
# Applies every migration to a scratch Postgres (with the Supabase platform
# bits stubbed) and then asserts the access matrix: owner/staff/non-member/
# anon each see exactly what their role permits. Run by CI on changes under
# supabase/ (.github/workflows/rls-test.yml); runnable locally against any
# DISPOSABLE database:
#
#   DATABASE_URL=postgresql://postgres@localhost:5432/scratch scripts/test-rls.sh
#
# NEVER point this at production — it creates test users and seed rows.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a DISPOSABLE scratch Postgres}"

root="$(cd "$(dirname "$0")/.." && pwd)"
mig="$root/supabase/migrations"
run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$1"; }

echo "── Stubbing Supabase platform (auth schema, roles, ad-hoc tables)"
run "$root/supabase/tests/setup-supabase-stub.sql"

echo "── Applying migrations"
# Dependency order. New migrations must be appended here as they land.
ordered=(
  create_bloomos_core.sql
  create_profiles.sql
  create_donations.sql
  create_quiz_submissions.sql
  create_partner_waitlist.sql
  create_meet_schema.sql
  create_fin_schema.sql
  add_fin_config_cash_reconciled_at.sql
  create_fr_agent_schema.sql
  create_hs_mirror_and_fr_scores.sql
  create_hs_sync_jobs.sql
  create_ops_projects_and_tasks.sql
  add_booking_id_to_ops_tasks.sql
  create_ygb_schema.sql
  create_demoday_notes.sql
  create_demoday_signups.sql
  update_donations_schema.sql
  add_meeting_location_options.sql
  add_meeting_type_duration_options.sql
  add_program_partnership_meeting_type.sql
  create_membership_bootstrap.sql
  add_org_id_to_tenant_tables.sql
  enable_rls_per_domain.sql
  add_ops_tasks_archived_at.sql
  create_connections_and_webhook_events.sql
  create_agenda_delegations_and_calendar_events.sql
  create_calendar_sync_jobs.sql
  create_fundraising_core.sql
  add_email_logging_to_interactions.sql
  add_shannon_present_to_interactions.sql
  add_recurring_plan_health.sql
  create_grants.sql
  create_opportunities.sql
  add_opportunities_external_ids.sql
  add_archive_and_prospect_disqualify.sql
  create_pledges.sql
  create_journeys.sql
  link_ops_tasks_to_entities.sql
  create_fr_pursue_function.sql
  create_fr_nba_suggestions.sql
  create_fr_hubspot_sync_function.sql
  fix_audit_partition_rls.sql
  import_hubspot_to_constituents.sql
  fix_interactions_external_idx_full_unique.sql
  dedupe_payment_gifts_against_deal_gifts.sql
  create_segments.sql
  create_email_campaigns.sql
  create_connection_candidates.sql
  create_compliance.sql
  create_board.sql
  create_kpis_and_plan.sql
  bloomos_strategy_phase1a.sql
  bloomos_strategy_phase1b.sql
  bloomos_strategy_phase2.sql
  bloomos_strategy_phase4.sql
  bloomos_strategy_kpi_snapshots.sql
  create_strategy_angles.sql
  extend_strategy_angles_framing.sql
  create_strategy_room_meta.sql
  create_funder_angles.sql
  create_briefings.sql
  create_partners.sql
  create_partner_contacts.sql
  seed_partners_2026.sql
  upgrade_ops_tasks_priority_subtasks_labels.sql
  create_students.sql
  create_cohorts_attendance.sql
  create_applications.sql
  create_bloomos_briefing_state.sql
  mark_hs_staging_readonly.sql
  drop_households_org_id_default.sql
  assert_fundraising_org_id.sql
  add_grant_id_to_ops_projects.sql
  finance_v2_config_runway_inputs.sql
  finance_v2_exclude_from_runway.sql
  finance_v2_close_stamp.sql
  finance_v2_pledge_external_ref.sql
  add_planned_day_to_ops_tasks.sql
  create_meeting_records.sql
  create_meeting_suggested_tasks.sql
  add_meeting_record_id_to_ops_tasks.sql
  add_external_ids_to_partner_interactions.sql
  add_calendar_event_id_to_ops_tasks.sql
  create_fr_prospects.sql
  create_fin_reconciliation_items.sql
  create_fr_prospect_promoted.sql
  rls_reed_phase1_four_tables.sql
  create_org_entitlements.sql
  create_reed_schema.sql
  create_reed_drafts.sql
  create_reed_suggestions.sql
  add_strategy_review_draft_kind.sql
  create_reed_plan_proposals.sql
  add_applied_id_to_reed_plan_proposals.sql
  fr_map_pledged_to_steward.sql
  fr_spine_include_unlinked_deals.sql
  ack_v2_1_schema_foundation.sql
  ack_v2_3_channels.sql
  ack_v2_4_seed_aa_stewardship.sql
  ack_v2_5_entity_vocab.sql
  ack_v2_6_polish.sql
  ack_v2_7_no_auto_send.sql
  ack_v2_8_major_gift_escalation.sql
  add_roll_count_to_ops_tasks.sql
  create_revenue_schedule.sql
  create_rhythm_sessions.sql
  strategy_build2_overrides_baselines.sql
  strategy_proof_points.sql
  consolidate_partnership_pipeline_into_partners.sql
  archive_migrated_partnership_opportunities.sql
  fr_sync_exclude_partnership_pipeline.sql
  entity_comments.sql
  notifications_spine.sql
  research_runs.sql
  create_messaging.sql
  surface_committed_deals_in_revenue_schedule.sql
  dedup_commitments_against_gifts.sql
  fix_due_tier_overdue_commitments_and_stale_grants.sql
  add_planned_week_to_ops_tasks.sql
  create_ops_task_health_view.sql
  create_ai_calls_ledger.sql
  messaging_realtime.sql
  messaging_v2.sql
  messaging_v2_replica.sql
  comms_v2_phase1_tables.sql
  comms_v2_phase1_default_drops.sql
  enforce_grant_funder.sql
  create_asks_log.sql
  spine_entity_registry.sql
  spine_action_items_view.sql
  spine_user_org_state.sql
  documents_schema.sql
  metrics_catalog_schema.sql
  metrics_plan_kpis_backfill.sql
  metrics_stale_queue_arm.sql
  metrics_retire_dead_kpi_tables.sql
  program_spine_schema.sql
  owner_uuid_promotion.sql
  reed_suggestions_payload.sql
  create_ms_career_library.sql
  create_ms_sessions.sql
  create_ms_explored.sql
  create_ms_deliveries.sql
  create_ms_rooms.sql
  create_meeting_exclusions.sql
  bloomos_strategy_objective_notes_tasks.sql
  participant_custom_fields.sql
  prospect_task_links.sql
  program_stage_tenant_neutral.sql
  create_reed_next_moves.sql
  fundraising_pipeline_config.sql
  fundraising_pipeline_remap.sql
  cohort_members_continuous.sql
  angel_connectors_pipeline_stages.sql
  drop_students_legacy_columns.sql
  close_projects_of_terminal_grants.sql
  compliance_notes_checklist.sql
  plan_kpis_notes.sql
  create_import_layer.sql
  constituent_custom_fields.sql
  hubspot_projection_external_refs.sql
  hubspot_projection_dedupe_pushed_deals.sql
  add_constituents_is_volunteer.sql
  add_students_leader_id.sql
  add_org_id_to_bloomos_briefing_state.sql
  demoday_notes_org_scoped_unique.sql
  seed_aa_hubspot_mirror_entitlement.sql
  create_grant_contacts.sql
  board_compliance_profiles.sql
  student_profile_route.sql
  tenant_neutral_assignees.sql
  create_org_settings.sql
  tenant_scope_briefing_narrative.sql
  drop_fr_prospects_org_id_default.sql
  seed_aa_ai_prospect_research.sql
  drop_donations_org_id_default.sql
  fin_dedup_hash_org_scope.sql
  stewardship_tenant_neutral_assignee.sql
  search_people_org_scope.sql
  add_documents_issued_at.sql
  add_documents_notes.sql
  hs_sync_jobs_add_totals.sql
  hubspot_backfill_constituent_names.sql
  create_game_pool.sql
  create_cut_rooms.sql
  create_game_daily.sql
  create_plan_archives.sql
  fundraising_plan.sql
  create_work_blocks_and_calendar_prefs.sql
  create_program_partners.sql
  fr_prospect_family_fks_and_org_not_null.sql
  fr_sync_resolve_companies_via_external_refs.sql
  spec_a_platform_contracts.sql
  seed_aa_modules_content.sql
  spec_a_v_obligations.sql
  spec_a_obligation_rpcs.sql
  spec_a_seed_contract2_metrics.sql
)
for f in "${ordered[@]}"; do
  echo "   $f"
  run "$mig/$f"
done

# audit_log's retention job needs pg_cron, which only exists on Supabase;
# the table, partitions, and policies apply before that statement, so a
# partial apply is expected here.
echo "   create_audit_log.sql (pg_cron step tolerated outside Supabase)"
psql "$DATABASE_URL" -q -f "$mig/create_audit_log.sql" 2>&1 | grep -v "^$" | tail -2 || true

# Catch migrations that exist on disk but aren't in the ordered list.
# Exclusions (applied/checked elsewhere, not in the ordered run):
#   create_audit_log.sql        — applied separately above (needs pg_cron).
#   pin_function_search_path.sql — only ALTERs functions (e.g.
#     hubspot_bench_candidates) created outside this RLS-tested migration
#     subset, so it can't apply here and is irrelevant to the leak matrix.
#   bloomos_global_search_phase3.sql — a SECURITY INVOKER fuzzy-search RPC plus
#     pg_trgm trigram indexes. RLS still applies (invoker), so it carries no
#     leak risk, and it needs the Supabase `extensions` schema / pg_trgm, which
#     the platform stub does not provide — so it can't apply to the scratch DB.
#   grant_shannon_owner.sql      — a data migration (UPDATE memberships for one
#     real user) that depends on seeded auth.users/orgs rows absent here.
#   bloomos_staff_phase1..4.sql  — mix schema with seed rows keyed to the real
#     AA org id ('17c75da8-…'), which doesn't exist in the scratch DB, so the
#     seed inserts violate the orgs FK. Their RLS follows the standard
#     has_permission(org_id, 'staff.*') pattern already exercised by the
#     matrix; splitting seed from schema so they can run here is a follow-up.
#   *.MANUAL.sql                 — manual data seeds run by hand in the Supabase
#     SQL editor (OGSM reseed, finance rebase). They mutate seeded rows, not
#     schema/RLS, and assume pre-existing data, so they are not part of the
#     migration chain and must not be applied to the scratch DB.
missing=$(ls "$mig"/*.sql | xargs -n1 basename |
  grep -v -F -x -f <(printf '%s\n' "${ordered[@]}" create_audit_log.sql pin_function_search_path.sql \
    bloomos_global_search_phase3.sql grant_shannon_owner.sql \
    bloomos_staff_phase1.sql bloomos_staff_phase2.sql bloomos_staff_phase3.sql bloomos_staff_phase4.sql) |
  grep -v -E '\.MANUAL\.sql$' || true)
if [ -n "$missing" ]; then
  echo "ERROR: migrations missing from the ordered list in $0:" >&2
  echo "$missing" >&2
  exit 1
fi

echo "── Running leak assertions"
run "$root/supabase/tests/rls-leak-test.sql"

echo "── Running tenant-default ratchet"
run "$root/supabase/tests/tenant-default-ratchet.sql"
