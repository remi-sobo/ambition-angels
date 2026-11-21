import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// V4 Stage A1: the shared kit uses tokens only. No component exported from
// the ui barrel (or the kit pieces it re-exports from app/admin/_components)
// may carry a hardcoded hex color; colors come from tailwind.config.ts and
// the .admin-shell vars, so a tenant re-accent changes the whole kit.

const ROOT = process.cwd();
const UI = join(ROOT, "app/admin/_components/ui");
const barrel = readFileSync(join(UI, "index.ts"), "utf8");

/** Every file the barrel re-exports from, resolved to a path. */
function exportedFiles(): string[] {
  const out = new Set<string>();
  for (const m of Array.from(barrel.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g))) {
    const base = join(UI, m[1]);
    for (const ext of [".tsx", ".ts"]) {
      try {
        readFileSync(base + ext);
        out.add(base + ext);
        break;
      } catch {
        // try the next extension
      }
    }
  }
  return Array.from(out).sort();
}

// A hex color literal: #abc, #abcd, #aabbcc, #aabbccdd, not inside an HTML
// entity ("&#8942;") or a URL-encoded data URI ("%23").
const HEX = /(?<![&\w%])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

describe("kit token discipline", () => {
  const files = exportedFiles();

  test("the barrel resolves to real files, including the V4 additions", () => {
    const names = files.map((f) => f.slice(ROOT.length + 1));
    for (const n of [
      "app/admin/_components/ui/Button.tsx",
      "app/admin/_components/ui/Field.tsx",
      "app/admin/_components/ui/Drawer.tsx",
      "app/admin/_components/ui/Modal.tsx",
      "app/admin/_components/ui/FilterRow.tsx",
      "app/admin/_components/ui/SavedViews.tsx",
      "app/admin/_components/ui/Figure.tsx",
      "app/admin/_components/ui/NextStepBar.tsx",
      "app/admin/_components/ui/Timeline.tsx",
      "app/admin/_components/ui/Notice.tsx",
      "app/admin/_components/ui/Skeleton.tsx",
      "app/admin/_components/PageHeader.tsx",
      "app/admin/_components/EmptyState.tsx",
      "app/admin/_components/StatCard.tsx",
    ]) {
      expect(names, n).toContain(n);
    }
  });

  test("no exported kit file hardcodes a hex color", () => {
    const hits: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of Array.from(src.matchAll(HEX))) hits.push(`${f.slice(ROOT.length + 1)}: ${m[0]}`);
    }
    expect(hits, "Use a token (tailwind.config.ts / .admin-shell vars), not a hex.").toEqual([]);
  });

  test("every ui/*.tsx component file is exported from the barrel", () => {
    // .ts hooks (useFocusTrap) stay out of the barrel on purpose: see index.ts.
    const exported = new Set(files.map((f) => f.slice(UI.length + 1)));
    const missing = readdirSync(UI)
      .filter((n) => n.endsWith(".tsx"))
      .filter((n) => !exported.has(n));
    expect(missing).toEqual([]);
  });
});
