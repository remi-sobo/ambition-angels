import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The role → permission seed exactly as supabase/migrations writes it, parsed
 * from every `insert into role_permissions ... values (...)` tuple. Tests use
 * this instead of a hand-copied table so a seed change is reflected here.
 */
export function seededRolePermissions(): { role: string; permission: string }[] {
  const dir = join(__dirname, "..", "..", "supabase", "migrations");
  const rows = new Map<string, { role: string; permission: string }>();
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const re = /insert into (?:public\.)?role_permissions\s*\(role,\s*permission\)\s*values([\s\S]*?);/gi;
    for (const m of Array.from(sql.matchAll(re))) {
      for (const t of Array.from(m[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_.]+)'\s*\)/g))) {
        rows.set(`${t[1]}|${t[2]}`, { role: t[1], permission: t[2] });
      }
    }
  }
  return Array.from(rows.values());
}
