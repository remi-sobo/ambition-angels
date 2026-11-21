#!/usr/bin/env bash
# V4 Stage P runner: starts the mock Supabase and the app (unless they are
# already up), runs one suite, and stops what it started.
#
#   bash e2e/v4/smoke.sh smoke    # the six Section 9 workflows, 2 orgs x 3 roles x desktop+phone
#   bash e2e/v4/smoke.sh roles    # every admin route, 2 orgs x 4 roles, then the table
#   bash e2e/v4/smoke.sh a11y     # axe on every route (owner, 1440 + 390) and the keyboard pass
#   bash e2e/v4/smoke.sh visual   # screenshots vs e2e/v4/baseline (add --update to rewrite it)
#   bash e2e/v4/smoke.sh all
#
# Env: V4_APP_PORT (3032), V4_MOCK_PORT (55352), V4_SERVER=dev|start (dev;
# "start" builds once and serves the production build, much faster for the
# route-wide suites). Extra args go to Playwright (e.g. --project phone -g gift).
# Traces are off unless you pass --trace on.
set -uo pipefail
cd "$(dirname "$0")/../.."
SUITE="${1:-smoke}"; shift || true
APP_PORT="${V4_APP_PORT:-3032}"
MOCK_PORT="${V4_MOCK_PORT:-55352}"
export V4_BASE="http://localhost:${APP_PORT}"
export V4_MOCK="http://127.0.0.1:${MOCK_PORT}"
LOG=e2e/v4/.logs
mkdir -p "$LOG"
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

up() { curl -s -o /dev/null -m 5 "$1"; }

if ! up "$V4_MOCK/__mock/health"; then
  V4_PORT="$MOCK_PORT" V4_TWO_ORG=1 V4_PERSIST=1 node e2e/v4/mock-supabase.mjs >"$LOG/mock.log" 2>&1 &
  PIDS+=($!)
  for _ in $(seq 1 30); do up "$V4_MOCK/__mock/health" && break; sleep 1; done
fi

if ! up "$V4_BASE/admin"; then
  if [ -f .env.local ]; then
    echo "smoke: .env.local exists. Real keys in it would reach real services; move it aside or start the app yourself against the mock." >&2
    exit 2
  fi
  JWT() { node -e 'const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");console.log(b({alg:"HS256",typ:"JWT"})+"."+b({role:process.argv[1],iss:"supabase",exp:4102444800})+".sig")' "$1"; }
  export NEXT_PUBLIC_SUPABASE_URL="$V4_MOCK"
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$(JWT anon)"; export NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY="$(JWT service_role)"; export SUPABASE_SERVICE_ROLE_KEY
  # Two modules refuse to load without a key (unsubscribe signing, the Stripe
  # client), and a production build loads every module. Throwaway values for
  # the mock run only; no test calls Stripe.
  export UNSUBSCRIBE_SECRET="v4-mock-not-a-secret"
  export STRIPE_SECRET_KEY="sk_test_v4_mock_not_a_key"
  if [ "${V4_SERVER:-dev}" = "start" ]; then
    npx next build >"$LOG/build.log" 2>&1 || { echo "smoke: build failed, see $LOG/build.log" >&2; exit 1; }
    npx next start -p "$APP_PORT" >"$LOG/app.log" 2>&1 &
  else
    npx next dev -p "$APP_PORT" >"$LOG/app.log" 2>&1 &
  fi
  PIDS+=($!)
  for _ in $(seq 1 120); do up "$V4_BASE/admin" && break; sleep 2; done
fi

PW="npx playwright test -c e2e/v4/smoke/playwright.config.ts"
case "$SUITE" in
  smoke) $PW e2e/v4/smoke/workflows.spec.ts "$@" ;;
  roles) $PW e2e/v4/smoke/routes.spec.ts --project desktop "$@"; s=$?; node e2e/v4/smoke/report.mjs roles; exit $s ;;
  a11y) $PW e2e/v4/smoke/a11y.spec.ts "$@"; s=$?; node e2e/v4/smoke/report.mjs a11y; exit $s ;;
  visual) node e2e/v4/visual.mjs "$@" ;;
  all)
    s=0
    $PW e2e/v4/smoke/workflows.spec.ts || s=1
    $PW e2e/v4/smoke/routes.spec.ts --project desktop || s=1
    $PW e2e/v4/smoke/a11y.spec.ts || s=1
    node e2e/v4/smoke/report.mjs roles; node e2e/v4/smoke/report.mjs a11y
    node e2e/v4/visual.mjs || s=1
    exit $s ;;
  *) echo "usage: smoke.sh smoke|roles|a11y|visual|all [playwright args]" >&2; exit 2 ;;
esac
