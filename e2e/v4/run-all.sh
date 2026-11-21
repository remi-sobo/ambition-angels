#!/usr/bin/env bash
# The four standard V4 capture runs plus the special states. Needs the mock
# (node e2e/v4/mock-supabase.mjs) and `npm run dev` already up.
#   V4_SHOTS=/some/dir bash e2e/v4/run-all.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT="${V4_SHOTS:-e2e/v4/out}"
C="node e2e/v4/capture.mjs --out $OUT"
$C --run populated-owner --set all --viewports desktop,phone --profile populated --role owner
$C --run empty-owner --set nav --viewports desktop,phone --profile empty --role owner
$C --run populated-board_viewer --set nav --viewports desktop --profile populated --role board_viewer
$C --run populated-staff --set nav --viewports desktop --profile populated --role staff
node e2e/v4/capture.mjs --out "$OUT" --run populated-finance --set nav --viewports desktop --profile populated --role finance
curl -s -XPOST -H 'content-type: application/json' -d '{"profile":"populated","role":"owner"}' http://127.0.0.1:55321/__mock/config >/dev/null
node e2e/v4/special-states.mjs --out "$OUT" --run special
for r in populated-owner empty-owner populated-board_viewer populated-staff populated-finance special; do
  node e2e/v4/contact-sheet.mjs "$OUT/$r" --viewport desktop >/dev/null
  node e2e/v4/contact-sheet.mjs "$OUT/$r" --viewport phone >/dev/null 2>&1 || true
done
echo DONE
