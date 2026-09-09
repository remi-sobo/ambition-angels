import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { networkMessage, userMessage } from "@/lib/admin/errors";

// Quality Floor, stage Q2 — the feedback infrastructure (F2's fix, built
// before any call site migrates). The contract under unit test: no raw HTTP
// status ever reaches a person; a fit-for-humans server message is
// preferred; everything else speaks for the status CLASS. Structural pins:
// the providers mount in the layout, the dialog keeps the interruption with
// the verb on the button.

const app = join(__dirname, "..", "app");
const src = (...p: string[]) => readFileSync(join(app, ...p), "utf8");

describe("userMessage: the transport layer never reaches the person (DoD 4)", () => {
  test("every status class maps to an actionable sentence with NO status code in it", () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 418]) {
      const msg = userMessage({ status });
      expect(msg.length).toBeGreaterThan(20);
      expect(msg, String(status)).not.toMatch(/\b[45]\d\d\b/); // no code leaks
      expect(msg).not.toMatch(/HTTP/i);
    }
  });

  test("a server message fit for a person is preferred verbatim", () => {
    expect(
      userMessage({ status: 422 }, { error: "That grant already has a payment for October." }),
    ).toBe("That grant already has a payment for October.");
    expect(userMessage({ status: 400 }, { message: "Amount must be positive." })).toBe(
      "Amount must be positive.",
    );
  });

  test("a server message UNFIT for a person falls back to the class sentence", () => {
    // The audit's exact anti-pattern, echoed by the server:
    expect(userMessage({ status: 500 }, { error: "HTTP 500" })).not.toMatch(/HTTP|500/);
    // A status-code echo, a stack, an empty string, a blob:
    expect(userMessage({ status: 500 }, { error: "upstream returned 502" })).not.toMatch(/502/);
    expect(userMessage({ status: 500 }, { error: "  " })).not.toMatch(/^\s*$/);
    expect(userMessage({ status: 500 }, { error: "x".repeat(300) })).not.toContain("xxx");
    expect(userMessage({ status: 500 }, { error: "TypeError at lib/foo.ts:12 stack..." })).not.toContain("lib/foo.ts");
  });

  test("failure copy owns the outcome: 5xx says the changes were NOT saved", () => {
    expect(userMessage({ status: 500 })).toMatch(/not saved/i);
    expect(networkMessage()).toMatch(/nothing was saved/i);
    expect(networkMessage()).not.toMatch(/\d{3}/);
  });
});

describe("Q2 structural pins", () => {
  test("both providers mount in the authed layout (Q3's call sites can reach them anywhere)", () => {
    const layout = src("admin", "layout.tsx");
    expect(layout).toMatch(/<ToastProvider>/);
    expect(layout).toMatch(/<ConfirmProvider>/);
    expect(layout.indexOf("<ToastProvider>")).toBeLessThan(layout.indexOf("<V2Sidebar"));
  });

  test("the toast layer: non-blocking, announced, dismissible, errors linger", () => {
    const s = src("admin", "_components", "feedback", "ToastProvider.tsx");
    expect(s).toMatch(/aria-live="polite"/);
    expect(s).toMatch(/aria-label="Dismiss"/);
    expect(s).toMatch(/error: 8000/); // errors persist longer than successes
    expect(s).not.toMatch(/alert\([^)]/); // a real call carries an argument; the comment's "alert()" may not
  });

  test("the confirm dialog keeps the interruption and puts the VERB on the button", () => {
    const s = src("admin", "_components", "feedback", "ConfirmProvider.tsx");
    expect(s).toMatch(/confirmLabel: string/); // required — never an implicit "OK"
    expect(s).toMatch(/Promise<boolean>/); // the mechanical Q3 shape
    expect(s).toMatch(/aria-modal="true"/);
    expect(s).toMatch(/Escape/); // escape and scrim both cancel
    expect(s).toMatch(/destructive\?/);
  });
});

// ── Q3: the migration is complete and stays complete ────────────────────────
// Every alert()/confirm()/prompt() call site (195 at the audit) moved onto
// the Q2 layer, and ESLint's no-alert bans the natives across app/admin so a
// new screen can't quietly reintroduce one (DoD 3). The source scan below is
// the belt to that suspender: `confirm(` can't be scanned for (the useConfirm
// binding deliberately shares the name, so a missed native call is a type
// error), but the other shapes can.

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("Q3: no native dialog survives in app/admin (DoD 3)", () => {
  const files = walk(join(app, "admin"));

  test("no alert(), prompt(), or window.-prefixed native call anywhere", () => {
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      // Real calls carry an argument or a window. prefix; the feedback
      // providers' own identifiers (useToast/useConfirm machinery) don't.
      expect(s, f).not.toMatch(/(?<![.\w])alert\(/);
      expect(s, f).not.toMatch(/(?<![.\w])prompt\(/);
      expect(s, f).not.toMatch(/window\.(alert|confirm|prompt)\(/);
    }
  });

  test("the ESLint ban is in force: no-alert errors, scoped to app/admin", () => {
    const rc = JSON.parse(readFileSync(join(__dirname, "..", ".eslintrc.json"), "utf8"));
    const override = (rc.overrides ?? []).find(
      (o: { files?: string[] }) => (o.files ?? []).some((f: string) => f.includes("app/admin/**")),
    );
    expect(override, "app/admin override missing from .eslintrc.json").toBeTruthy();
    expect(override.rules["no-alert"]).toBe("error");
  });
});
