import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { askSupportSentence, supportEmail, supportHint } from "@/lib/admin/support";

// V4 Stage F (spec §11 "Support: a support address and a 'report a problem'
// action replace 'tell Remi'"). No BloomOS screen, toast or API message may
// send a person to an operator by name. Help goes through lib/admin/support.ts:
// NEXT_PUBLIC_SUPPORT_EMAIL, then the org's support_email, then Report an issue.

const ROOT = join(__dirname, "..");
const SCOPE = ["app/admin", "app/api/admin", "lib/admin", "lib/email/org-identity.ts", "lib/email/operator.ts"];

/** Files owned by another stage, flagged for its owner rather than edited here. */
const ALLOW: Record<string, string> = {
  "app/admin/capture/_lib/captureApi.ts": "Capture is another stage's file (\"Tell Remi.\" on a 503); flagged to its owner",
  "app/admin/capture/_components/CaptureModal.tsx": "Capture is another stage's file (a placeholder naming Shannon); flagged to its owner",
};

function walk(p: string, out: string[] = []): string[] {
  const abs = join(ROOT, p);
  if (statSync(abs).isFile()) return [...out, abs];
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    if (statSync(child).isDirectory()) walk(relative(ROOT, child), out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(child);
  }
  return out;
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// Operator names as words (capitalized, so data handles like 'shannon' in
// assignee code don't count), their addresses, and the old phrasings.
const OPERATOR = /\b(Remi|Shannon)\b|remi@|shannon@|BloomOS contact|BloomOS administrator/;

describe("support copy: no operator name in user-facing strings", () => {
  test("no admin UI or API string names an operator", () => {
    const hits: string[] = [];
    for (const file of SCOPE.flatMap((p) => walk(p))) {
      const r = relative(ROOT, file).split("\\").join("/");
      if (ALLOW[r]) continue;
      strip(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (OPERATOR.test(line)) hits.push(`${r}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    expect(hits).toEqual([]);
  });

  test("the allow-list only names files that still need it", () => {
    for (const r of Object.keys(ALLOW)) {
      expect(OPERATOR.test(strip(readFileSync(join(ROOT, r), "utf8"))), r).toBe(true);
    }
  });

  test("error toasts point at support, never a person", async () => {
    const { userMessage } = await import("@/lib/admin/errors");
    for (const s of [500, 418]) {
      const m = userMessage({ status: s });
      expect(m).toMatch(/Report an issue/);
      expect(m).not.toMatch(OPERATOR);
    }
  });

  test("the address comes from config, then the org, else Report an issue", () => {
    const prev = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    try {
      delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
      expect(supportEmail()).toBeNull();
      expect(supportEmail({ support_email: "help@harbor.example.org" })).toBe("help@harbor.example.org");
      expect(supportHint(null)).toBe("use Report an issue in the + menu");
      expect(askSupportSentence(null)).toMatch(/^Use Report an issue/);
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@bloomos.example.org";
      expect(supportEmail({ support_email: "help@harbor.example.org" })).toBe("support@bloomos.example.org");
      expect(supportHint()).toBe("use Report an issue in the + menu, or write to support@bloomos.example.org");
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "not an email";
      expect(supportEmail()).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
      else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = prev;
    }
  });
});
