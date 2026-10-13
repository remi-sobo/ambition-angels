import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Capture C4 fence: the record and confirm UI talks only to /api/admin/capture/**.
// It never names a destination table, never imports a Supabase client into a
// client component, and never reaches the service-role client. The one server
// file (the resume page) reads captures/capture_cards through the session client.

const root = process.cwd();
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p.slice(root.length + 1));
  }
  return out;
}

const files = [...walk(join(root, "app", "admin", "capture")), "lib/hooks/continuousSpeech.ts", "lib/hooks/useContinuousSpeech.ts"];
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const DESTINATIONS = ["interactions", "partner_interactions", "ops_tasks", "reed_drafts", "students", "constituents", "partners"];

describe("capture UI fence", () => {
  test("the stage ships its files", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "app/admin/capture/[id]/page.tsx",
        "app/admin/capture/_components/CaptureModal.tsx",
        "app/admin/capture/_components/ConfirmStack.tsx",
        "app/admin/capture/_lib/captureApi.ts",
      ]),
    );
  });

  for (const rel of files) {
    const src = read(rel);
    test(`${rel}: no service role, no destination table, no student entity`, () => {
      expect(src).not.toMatch(/getSupabaseAdmin|lib\/supabase\/admin/);
      for (const t of DESTINATIONS) expect(src, t).not.toMatch(new RegExp(`from\\(\\s*["'\`]${t}["'\`]\\s*\\)`));
      expect(src).not.toMatch(/type:\s*["']student["']/);
    });

    test(`${rel}: every fetch goes to /api/admin/capture/**`, () => {
      const urls = Array.from(src.matchAll(/fetch\(\s*([`"'])([^`"']*)/g)).map((m) => m[2]);
      for (const u of urls) expect(u.startsWith("/api/admin/capture") || u === "").toBe(true);
      const literalPaths = Array.from(src.matchAll(/["'`](\/api\/[^"'`$?]*)/g)).map((m) => m[1]);
      for (const u of literalPaths) expect(u, rel).toMatch(/^\/api\/admin\/capture(\/|$)/);
    });
  }

  test("client components never import a Supabase client", () => {
    for (const rel of files.filter((f) => read(f).startsWith('"use client"'))) {
      expect(read(rel), rel).not.toMatch(/@\/lib\/supabase\//);
    }
  });

  test("the resume page gates on ai.capture and reads only capture tables through the session client", () => {
    const src = read("app/admin/capture/[id]/page.tsx");
    expect(src).toMatch(/hasFeature\(ents, "ai\.capture"\)/);
    expect(src).toMatch(/createServerSupabase\(\)/);
    const tables = Array.from(src.matchAll(/from\(\s*["']([a-z_]+)["']\s*\)/g)).map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["captures", "capture_cards"]));
  });

  test("ReportModal and the old speech hook are untouched by C4", () => {
    expect(read("app/admin/_components/ReportModal.tsx")).not.toMatch(/useContinuousSpeech/);
    expect(read("lib/hooks/useSpeechRecognition.ts")).not.toMatch(/continuousSpeech/);
  });
});

describe("Record entry points", () => {
  const mobile = read("app/admin/_components/v2/V2MobileBar.tsx");
  const quick = read("app/admin/_components/v2/V2QuickAdd.tsx");
  const layout = read("app/admin/layout.tsx");

  test("the layout computes captureEnabled from ai.capture and passes it to both", () => {
    expect(layout).toMatch(/const captureEnabled = !!ents && hasFeature\(ents, "ai\.capture"\);/);
    expect(layout).toMatch(/<V2MobileBar [^>]*captureEnabled=\{captureEnabled\}/);
    expect(layout).toMatch(/<V2QuickAdd [^>]*captureEnabled=\{captureEnabled\}/);
  });

  test("mobile: Record in the + sheet and the More sheet, both gated", () => {
    expect(mobile.match(/captureEnabled && \(/g)?.length).toBe(2);
    expect(mobile.match(/setModal\("record"\)/g)?.length).toBe(2);
    expect(mobile).toMatch(/<CaptureModal surface="mobile_plus"/);
    // Record sits above Add task in the + sheet.
    expect(mobile.indexOf('title="Record"')).toBeLessThan(mobile.indexOf('title="Add task"'));
  });

  test("desktop: Record chip in Quick Add, gated", () => {
    expect(quick).toMatch(/captureEnabled && \(\s*<Chip label="Record"/);
    expect(quick).toMatch(/<CaptureModal surface="quick_add"/);
  });

  test("both default to hidden", () => {
    expect(mobile).toMatch(/captureEnabled = false/);
    expect(quick).toMatch(/captureEnabled = false/);
  });
});
