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
  create_donations.sql
  create_quiz_submissions.sql
  create_partner_waitlist.sql
  create_meet_schema.sql
  create_fin_schema.sql
  create_fr_agent_schema.sql
  create_hs_mirror_and_fr_scores.sql
  create_hs_sync_jobs.sql
  create_ops_projects_and_tasks.sql
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
  create_connections_and_webhook_events.sql
  create_fundraising_core.sql
  create_grants.sql
  create_opportunities.sql
  fix_audit_partition_rls.sql
  import_hubspot_to_constituents.sql
  create_segments.sql
  create_compliance.sql
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
missing=$(ls "$mig"/*.sql | xargs -n1 basename |
  grep -v -F -x -f <(printf '%s\n' "${ordered[@]}" create_audit_log.sql) || true)
if [ -n "$missing" ]; then
  echo "ERROR: migrations missing from the ordered list in $0:" >&2
  echo "$missing" >&2
  exit 1
fi

echo "── Running leak assertions"
run "$root/supabase/tests/rls-leak-test.sql"
