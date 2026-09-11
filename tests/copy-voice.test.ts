import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { violatesVoice } from "@/lib/ai/voice";

/**
 * Quality Floor Q6 — the copy gate.
 *
 * `lib/ai/voice.ts` already sweeps the em dash out of every string a MODEL
 * emits. This is the static half of the same house rule: the copy WE write
 * into BloomOS must not carry one either, so the admin reads in one voice
 * whether a sentence came from a model or from a component.
 *
 * The one survivor is the `—` empty-value glyph. That dash is data, not
 * prose: it is what a cell, a placeholder, or an unset field renders when
 * there is nothing to show. So an em dash is allowed only as the leading or
 * trailing standalone glyph of a value ("—", "IRS / CA / —", "— (set a
 * balance)") and never between two words, which is the prose tic.
 *
 * Comments, specs, and commit messages keep the house voice and are not
 * scanned: this walks the TypeScript AST and reads only string literals,
 * template chunks, and JSX text, so a comment can never trip the gate.
 */

const DIRS = ["app/admin", "lib/admin"];
const FILES = [
  "lib/fundraising/constituent-resolve.ts",
  "lib/fundraising/grants.ts",
  "lib/fundraising/enroll.ts",
  "lib/fundraising/plan.ts",
  "lib/fundraising/grantContacts.ts",
  "lib/comms/settings.ts",
  "lib/meetings/dossier.ts",
  "lib/hubspot/client.ts",
  "lib/google/oauth.ts",
  "lib/briefing.ts",
];

/**
 * Files whose string literals are instructions to a model, not copy a human
 * reads. Model OUTPUT is swept at the boundary by `cleanVoiceText`, so the
 * prompt itself is free to use the house voice.
 */
const PROMPT_FILES: Record<string, string> = {
  "lib/briefing.ts": "weekly briefing prompt + response schema",
  "lib/admin/briefing/narrate.ts": "briefing narration prompt + tool schema",
  "app/admin/strategic-plan/_components/ReedDesignButton.tsx": "Reed design-mode opening prompt",
  "app/admin/strategic-plan/_components/ReedReviewButton.tsx": "Reed review-mode opening prompt",
  "app/admin/strategic-plan/_components/ReedStartButton.tsx": "Reed start-mode opening prompt",
  "app/admin/meetings/_components/MeetingAgendaButton.tsx": "Reed agenda opening prompt",
};

/**
 * `note:` on a V2_ROUTE_MAP row is an engineering annotation on the redirect
 * table, read by nobody: the field is never imported outside its own module.
 * It is a comment that happens to live in a string, so it keeps the house voice.
 */
const ANNOTATION_FIELD = { file: "lib/admin/v2routes.ts", prop: "note" };

/** Developer diagnostics: a console line or a thrown Error, never rendered. */
const DIAGNOSTIC_CALLS = new Set(["console.error", "console.warn", "console.log", "console.info", "console.debug"]);

/** Strip the empty-value glyph: a standalone dash leading or trailing the string. */
function stripPlaceholderGlyph(text: string): string {
  return text.replace(/^\s*—(?=\s|$)/, "").replace(/(?:^|[\s/])\s*—\s*$/, "");
}

function walkDir(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkDir(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  const out: string[] = [];
  for (const d of DIRS) walkDir(d, out);
  for (const f of FILES) out.push(f);
  return Array.from(new Set(out)).sort();
}

/** True when this literal sits inside a console call or a thrown/constructed Error. */
function isDiagnostic(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text.endsWith("Error")) return true;
    if (ts.isCallExpression(p) && DIAGNOSTIC_CALLS.has(p.expression.getText())) return true;
    if (ts.isThrowStatement(p)) return true;
  }
  return false;
}

type Hit = { file: string; line: number; text: string };

function scan(file: string): Hit[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: Hit[] = [];

  const record = (node: ts.Node, text: string) => {
    if (!violatesVoice(stripPlaceholderGlyph(text))) return;
    if (isDiagnostic(node)) return;
    if (
      file === ANNOTATION_FIELD.file &&
      ts.isPropertyAssignment(node.parent) &&
      node.parent.name.getText(sf) === ANNOTATION_FIELD.prop
    ) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push({ file, line: line + 1, text: text.trim().slice(0, 90) });
  };

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) record(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) record(node, node.text);
    else if (ts.isJsxText(node)) record(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("Q6 copy voice", () => {
  const files = sourceFiles();

  it("scans the admin surface", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("has no em dash in rendered copy", () => {
    const hits = files.filter((f) => !(f in PROMPT_FILES)).flatMap(scan);
    expect(hits.map((h) => `${h.file}:${h.line}  ${h.text}`)).toEqual([]);
  });

  it("keeps the — placeholder", () => {
    // The empty-value glyph is data, not prose, and must survive the sweep.
    expect(violatesVoice(stripPlaceholderGlyph("—"))).toBe(false);
    expect(violatesVoice(stripPlaceholderGlyph("IRS / CA / —"))).toBe(false);
    expect(violatesVoice(stripPlaceholderGlyph("— (set a balance)"))).toBe(false);
    // Prose is still caught, including next to a placeholder-shaped edge.
    expect(violatesVoice(stripPlaceholderGlyph("Runway is short — raise or cut"))).toBe(true);
    expect(violatesVoice(stripPlaceholderGlyph("— a lead line — and more"))).toBe(true);
  });

  it("keeps the prompt exemptions honest", () => {
    // An exemption that no longer holds an em dash is stale: drop it.
    for (const [file, why] of Object.entries(PROMPT_FILES)) {
      expect(scan(file).length, `${file} (${why}) no longer needs an exemption`).toBeGreaterThan(0);
    }
  });
});
