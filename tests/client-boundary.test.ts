import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Client-boundary guard: a server module must not read a plain VALUE out of
 * a "use client" module.
 *
 * In Next 14, when a Server Component imports from a "use client" file, every
 * export it gets back is a client reference, not the real value. Rendering an
 * imported component that way is the whole point; reading a property on a
 * constant (`KIND_LABELS[item.kind]`) throws "You cannot dot into a client
 * module from a server component" and the route shows the error screen. This
 * took down compliance item detail, board member detail and Donor 360 (any
 * donor with a soft credit) at once.
 *
 * Heuristic: walk the server module graph from every App Router entry under
 * app/admin (page / layout / template / not-found / default / loading /
 * route), following imports through files WITHOUT "use client" and stopping
 * at "use client" boundaries. For every import a server file makes from a
 * "use client" file, each named value import must look like a component
 * (PascalCase). UPPER_SNAKE constants and lowercase names (helpers, hooks,
 * class strings) fail. Type-only imports and default imports are ignored.
 * Fix a hit by moving the value into a plain module (no directive) and
 * importing it from both sides, the way app/admin/partners/_lib/partners.ts
 * does.
 */

const REPO = join(__dirname, "..");
const ADMIN = join(REPO, "app", "admin");

// `${relPath}::${name}` → reason. Deliberately empty; add only a verified
// false positive, with the reason.
const ALLOW: Record<string, string> = {};

const ENTRY = /^(page|layout|template|not-found|default|loading|route)\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const srcCache = new Map<string, string>();
function src(file: string): string {
  let s = srcCache.get(file);
  if (s === undefined) {
    s = readFileSync(file, "utf8");
    srcCache.set(file, s);
  }
  return s;
}

/** True when the file's first statement is the given directive. */
function hasDirective(file: string, directive: string): boolean {
  const body = src(file).replace(/^(\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return body.startsWith(`"${directive}"`) || body.startsWith(`'${directive}'`);
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(REPO, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // package import
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile() && /\.(ts|tsx)$/.test(cand)) return cand;
  }
  return null;
}

type Imp = { spec: string; names: string[] };

/** Static imports and re-exports, with the VALUE names (original export
 *  names) each one pulls in. Type-only names are dropped. */
function imports(file: string): Imp[] {
  const out: Imp[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src(file)))) {
    const [, , typeOnly, clause, spec] = m;
    if (typeOnly) {
      out.push({ spec, names: [] });
      continue;
    }
    const names: string[] = [];
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const t = part.trim();
        if (!t || t.startsWith("type ")) continue;
        names.push(t.split(/\s+as\s+/)[0].trim());
      }
    }
    out.push({ spec, names });
  }
  return out;
}

const looksLikeComponent = (name: string) => /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);

function findViolations(): string[] {
  const entries = walk(ADMIN).filter((f) => ENTRY.test(f.split("/").pop()!) && !hasDirective(f, "use client"));
  const seen = new Set<string>();
  const queue = [...entries];
  const hits: string[] = [];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imp of imports(file)) {
      const target = resolveImport(file, imp.spec);
      if (!target) continue;
      if (hasDirective(target, "use client")) {
        for (const name of imp.names) {
          // `export { default as X }` re-exports a default, which (like a
          // default import) is the module's component.
          if (name === "default" || looksLikeComponent(name)) continue;
          const key = `${relative(REPO, file)}::${name}`;
          if (ALLOW[key]) continue;
          hits.push(`${key}  (from ${relative(REPO, target)})`);
        }
      } else {
        queue.push(target);
      }
    }
  }
  return hits.sort();
}

describe("client boundary", () => {
  test("no server module under app/admin reads a value export from a \"use client\" module", () => {
    expect(findViolations()).toEqual([]);
  });

  test("the scan sees the server graph (sanity)", () => {
    // If parsing breaks, the guard would pass vacuously. The compliance item
    // page must be reached and must import from its client controls.
    const page = join(ADMIN, "compliance", "[id]", "page.tsx");
    const fromClient = imports(page).some((i) => {
      const t = resolveImport(page, i.spec);
      return t !== null && hasDirective(t, "use client") && i.names.includes("ItemStatusActions");
    });
    expect(fromClient).toBe(true);
  });
});
