#!/usr/bin/env bash
# Apply (or tear down) the Northbridge Youth Alliance demo tenant with psql.
#
#   supabase/seed/northbridge_demo/apply.sh <DATABASE_URL>             # seed
#   supabase/seed/northbridge_demo/apply.sh <DATABASE_URL> --teardown  # remove
#   NB_ANCHOR=2027-02-10 supabase/seed/northbridge_demo/apply.sh <url> # rehearse a date
#
# Each section runs in its own psql session with the prelude prepended (the
# helpers are session-local pg_temp functions) and its own transaction, in
# dependency order. Every insert is idempotent, so re-running is safe.
# See specs/northbridge-demo-tenant.md.
set -euo pipefail
URL="${1:?usage: apply.sh <DATABASE_URL> [--teardown]}"
DIR="$(cd "$(dirname "$0")" && pwd)"
run() { { [ -n "${NB_ANCHOR:-}" ] && echo "set nb.anchor = '$NB_ANCHOR';"; cat "$DIR/00_prelude.sql" "$DIR/$1"; } \
  | psql "$URL" -X -q -v ON_ERROR_STOP=1 >/dev/null; echo "  applied $1"; }

if [ "${2:-}" = "--teardown" ]; then
  psql "$URL" -X -q -v ON_ERROR_STOP=1 -f "$DIR/99_teardown.sql"
  exit 0
fi

for s in 10_core 20_identity 25_anchors 30_donors 35_pipeline 40_finance 50_programs \
         60_impact 65_links 70_org 80_work 85_inbox_ai; do
  run "$s.sql"
done
