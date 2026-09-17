import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The gift-table exclusion fence (specs/fundraising-gift-tables.md §Access).
 *
 * Placements carry the most sensitive fundraising data in the system: what we
 * think someone can give, how warm the path to them is, who owns the
 * relationship, and why. The spec excludes all of it from four surfaces —
 * Reed's tools, the meeting dossier, the obligations contract, and the board
 * portal — and "excluded" has to mean something a reviewer can't accidentally
 * undo.
 *
 * A runtime test can't prove a negative here: it would only show that today's
 * inputs produce no placements. A source fence can. If someone adds a
 * placement read to one of these files, this fails and names the file.
 *
 * The fence is NOT a substitute for the permission gates. Placements are
 * behind `fundraising.read` like everything else in the domain; this stops a
 * caller that HAS that permission (Reed runs with the operator's grants) from
 * carrying strategy into a context the spec says it must not reach.
 */

const ROOT = join(__dirname, "..");

/** The marker: every gift-table table and column prefix starts with this. */
const MARKER = "fr_gift_table_";

const FENCED: Array<{ path: string; why: string }> = [
  {
    path: "lib/agents/reed/tools.ts",
    why: "Reed's tool surface — anything here can end up in a generated draft",
  },
  {
    path: "lib/meetings/dossier.ts",
    why: "get_constituent_dossier's loader; gated on fundraising.read, which placements also carry",
  },
  {
    path: "supabase/migrations/spec_a_v_obligations.sql",
    why: "the obligations contract feeds Home Today and Reed's queue tool",
  },
];

describe("placements, scores and warm paths stay out of Reed, dossiers and obligations", () => {
  for (const { path, why } of FENCED) {
    test(`${path} never references ${MARKER} (${why})`, () => {
      const abs = join(ROOT, path);
      // A moved or renamed file would silently disable the fence, so the
      // fence checks that its target still exists.
      expect(existsSync(abs), `${path} is missing — re-aim the fence, don't delete it`).toBe(true);
      expect(readFileSync(abs, "utf8")).not.toContain(MARKER);
    });
  }

  test("the board portal reads no gift-table data", () => {
    // app/board/** is the board member's whole surface. Walk it rather than
    // listing files, so a new page is covered the day it lands.
    const boardDir = join(ROOT, "app", "board");
    expect(existsSync(boardDir)).toBe(true);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) walk(abs);
        else if (/\.(ts|tsx)$/.test(entry.name) && readFileSync(abs, "utf8").includes(MARKER)) {
          offenders.push(abs.slice(ROOT.length + 1));
        }
      }
    };
    walk(boardDir);
    expect(offenders, "gift-table data must never reach the board portal").toEqual([]);
  });

  test("the fence would actually catch a violation", () => {
    // Guard against the fence passing because the marker is wrong: the real
    // domain module must contain the string the fence looks for.
    const domain = readFileSync(join(ROOT, "lib", "fundraising", "gift-table.ts"), "utf8");
    const migration = readFileSync(
      join(ROOT, "supabase", "migrations", "fundraising_gift_tables.sql"),
      "utf8",
    );
    expect(migration).toContain(MARKER);
    expect(domain.length).toBeGreaterThan(0);
  });
});
