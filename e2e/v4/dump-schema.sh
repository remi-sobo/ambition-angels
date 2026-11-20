#!/usr/bin/env bash
# Regenerate e2e/v4/fixtures/{schema,fks,enums,pg_enums,reference}.json from the
# repo's migrations, using a THROWAWAY local Postgres (never production).
#
#   bash e2e/v4/dump-schema.sh            # needs postgres 16 binaries + a postgres OS user
#
# It applies every migration the same way CI's RLS test does
# (scripts/test-rls.sh), plus the four staff migrations that script skips
# (their AA-keyed seed inserts fail on the FK and are dropped; schema and
# role_permissions apply),
# then dumps column sets, foreign keys and check-constraint enums. Reference
# rows that migrations seed (role_permissions, entity_types, the chart of
# accounts, pipeline stages, metric definitions) are dumped too; tenant rows
# are not.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/e2e/v4/fixtures"
pgdir=/tmp/v4pg
bin=/usr/lib/postgresql/16/bin
port=55432

if ! psql -h "$pgdir" -p "$port" -U postgres -c 'select 1' >/dev/null 2>&1; then
  mkdir -p "$pgdir" && chown postgres "$pgdir"
  su postgres -c "$bin/initdb -D $pgdir/data -A trust -U postgres >$pgdir/init.log 2>&1"
  su postgres -c "$bin/pg_ctl -D $pgdir/data -o '-p $port -k $pgdir' -l $pgdir/pg.log start"
  sleep 2
fi
P="psql -h $pgdir -p $port -U postgres"
$P -c 'drop database if exists v4schema' -q
$P -c 'create database v4schema' -q
export DATABASE_URL="postgresql://postgres@/v4schema?host=$pgdir&port=$port"
bash "$root/scripts/test-rls.sh" >"$pgdir/rls.log" 2>&1 || { echo "migrations failed; see $pgdir/rls.log"; exit 1; }
# the RLS test stubs a minimal public.staff; replace it with the real one
$P v4schema -q -c "drop table if exists public.staff cascade" >/dev/null 2>&1
for f in bloomos_staff_phase1 bloomos_staff_phase2 bloomos_staff_phase3 bloomos_staff_phase4; do
  $P v4schema -q -f "$root/supabase/migrations/$f.sql" >/dev/null 2>&1 || true
done
Q="$P v4schema -At -c"

$Q "select json_object_agg(t, cols) from (
 select c.table_name t, json_agg(json_build_object('n',c.column_name,'t',c.udt_name,'null',c.is_nullable='YES','d',c.column_default) order by c.ordinal_position) cols
 from information_schema.columns c where c.table_schema='public' group by c.table_name) x" >"$out/schema.json"

$Q "select json_agg(json_build_object('from',tc.table_name,'col',kcu.column_name,'to',ccu.table_name,'tocol',ccu.column_name))
 from information_schema.table_constraints tc
 join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
 join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
 where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'" >"$out/fks.json"

$Q "select json_agg(json_build_object('t',conrelid::regclass::text,'def',pg_get_constraintdef(oid))) from pg_constraint where contype='c' and connamespace='public'::regnamespace" >"$pgdir/checks.json"
node -e '
const c=require(process.argv[1]);const out={};
for(const {t,def} of c){
 const m=def.match(/\(\(?\(?([a-z_0-9]+)\)?(?:::text)? = ANY \(\(?ARRAY\[(.*?)\]/); if(!m) continue;
 const vals=[...m[2].matchAll(/'"'"'([^'"'"']*)'"'"'/g)].map(x=>x[1]); if(!vals.length) continue;
 (out[t.replace(/^public\./,"")] ||= {})[m[1]]=vals;}
require("fs").writeFileSync(process.argv[2],JSON.stringify(out,null,1));' "$pgdir/checks.json" "$out/enums.json"

$Q "select json_object_agg(typname, vals) from (select t.typname, json_agg(e.enumlabel order by e.enumsortorder) vals from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname) x" >"$out/pg_enums.json"

# Reference rows seeded by migrations (generic, no people). Leak-test rows excluded.
$Q "select json_build_object(
  'role_permissions', (select json_agg(r) from role_permissions r),
  'entity_types', (select json_agg(r) from entity_types r),
  'fin_categories', (select json_agg(r) from fin_categories r),
  'pipelines', (select json_agg(r) from pipelines r),
  'pipeline_stages', (select json_agg(r) from pipeline_stages r),
  'metric_definitions', (select json_agg(r) from metric_definitions r),
  'participant_stages', (select json_agg(r) from participant_stages r where org_id=(select id from orgs where slug='ambition-angels'))
)" >"$out/reference.json"
echo "schema: $(node -e "console.log(Object.keys(require('$out/schema.json')).length)") tables"
