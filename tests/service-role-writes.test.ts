import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

// Service-role write-on-behalf ratchet (Sobo playbook / Esface A3): the
// service-role client bypasses RLS, so writes it makes for ANOTHER user must
// stay confined to a handful of named, documented modules. This enforces the
// clearest such invariant — notifications are written for arbitrary recipients,
// and the spine's contract (lib/notifications/notify.ts) is that notify() is
// the ONLY insert path. If a new emitter hand-rolls a notifications insert, this
// fails, pointing back at the registry in docs/bloomos/04-security-compliance.md.

const ROOTS = ["lib", "app"];
// After whitespace is collapsed, the insert reads `from("notifications").insert`.
const NOTIF_INSERT = /from\(['"]notifications['"]\)\.insert/;
const ALLOWED = join("lib", "notifications", "notify.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("service-role write-on-behalf registry", () => {
  test("notifications are inserted only from lib/notifications/notify.ts", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const collapsed = readFileSync(file, "utf8").replace(/\s+/g, "");
        if (NOTIF_INSERT.test(collapsed) && !file.endsWith(sep + ALLOWED)) {
          offenders.push(file);
        }
      }
    }
    expect(
      offenders,
      "notifications must be written only via notify() — register a new write-on-behalf path in docs/bloomos/04-security-compliance.md before adding one",
    ).toEqual([]);
  });
});
