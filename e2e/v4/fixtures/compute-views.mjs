#!/usr/bin/env node
// Compute the SQL views (v_obligations, v_action_items, v_revenue_schedule,
// v_fr_rollups, ...) over the generated fixtures by loading them into the
// THROWAWAY local Postgres that dump-schema.sh builds, then selecting from the
// real view definitions. Output: fixtures/views.json, which index.mjs merges
// into the populated profile. Re-run after changing fixtures:
//
//   bash e2e/v4/dump-schema.sh   # once, builds the v4schema database
//   node e2e/v4/fixtures/compute-views.mjs
//
// Dates in fixtures are relative to "now", so views go stale by a day per day;
// re-run before an audit session for exact "due today" rows.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildFixtures } from "./index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PG = ["-h", "/tmp/v4pg", "-p", "55432", "-U", "postgres"];
const psql = (db, sql, extra = []) => execFileSync("psql", [...PG, db, "-v", "ON_ERROR_STOP=1", "-At", ...extra, "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 });

psql("postgres", "drop database if exists v4views");
psql("postgres", "create database v4views template v4schema");

const views = psql("v4views", "select table_name from information_schema.views where table_schema='public'").trim().split("\n").filter(Boolean);
const tables = psql("v4views", "select string_agg(format('%I', table_name), ',') from information_schema.tables where table_schema='public' and table_type='BASE TABLE'").trim();
psql("v4views", `truncate ${tables} cascade`);

const fx = buildFixtures({ profile: "populated", skipViews: true });
const tmp = fs.mkdtempSync("/tmp/v4pg/load-");
fs.chmodSync(tmp, 0o755);
let sql = "set session_replication_role = replica;\n";
const failed = [];
for (const [t, rows] of Object.entries(fx.tables)) {
  if (!rows.length || views.includes(t)) continue;
  const f = path.join(tmp, `${t}.json`);
  fs.writeFileSync(f, JSON.stringify(rows));
  fs.chmodSync(f, 0o644);
  sql += `do $$ begin insert into public.${t} select * from json_populate_recordset(null::public.${t}, pg_read_file('${f}')::json); exception when others then raise warning 'LOADFAIL ${t}: %', sqlerrm; end $$;\n`;
}
fs.writeFileSync(path.join(tmp, "load.sql"), sql);
fs.chmodSync(path.join(tmp, "load.sql"), 0o644);
const load = spawnSync("psql", [...PG, "v4views", "-q", "-f", path.join(tmp, "load.sql")], { encoding: "utf8" });
const loadFails = (load.stderr || "").split("\n").filter((l) => l.includes("LOADFAIL"));
if (loadFails.length) console.log("tables that failed to load (their rows are missing from view inputs):\n" + loadFails.join("\n"));
const result = {};
for (const v of views) {
  try {
    result[v] = JSON.parse(psql("v4views", `select coalesce(json_agg(x), '[]') from public.${v} x`) || "[]");
  } catch (e) {
    failed.push(`${v}: ${String(e.stderr || e.message).split("\n")[0]}`);
  }
}
result._generatedAt = new Date().toISOString();
fs.writeFileSync(path.join(here, "views.json"), JSON.stringify(result));
console.log(Object.entries(result).filter(([k]) => k !== "_generatedAt").map(([k, v]) => `${k}:${v.length}`).join(" "));
if (failed.length) console.log("view failures:", failed);
fs.rmSync(tmp, { recursive: true, force: true });
