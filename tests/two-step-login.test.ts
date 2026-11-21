import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  TWO_STEP_ENROLL_PATH,
  TWO_STEP_VERIFY_PATH,
  hasVerifiedFactor,
  jwtAal,
  safeTwoStepNext,
  twoStepApiRefusal,
  twoStepPageRedirect,
  twoStepStatus,
  type TwoStepStatus,
} from "@/lib/auth/twoStep";

/**
 * Two-step login for everyone (pre-SafeSpace item D). The rule:
 *   aal1 + no verified factor → enroll; aal1 + factor → verify; aal2 → through.
 * Pages redirect; /api/admin, /api/reed and /api/board answer 401.
 */

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64u({ alg: "HS256" })}.${b64u(claims)}.sig`;

describe("the rule", () => {
  test("reads the aal claim from the access token", () => {
    expect(jwtAal(token({ aal: "aal2" }))).toBe("aal2");
    expect(jwtAal(token({ aal: "aal1" }))).toBe("aal1");
    expect(jwtAal(token({}))).toBeNull();
    expect(jwtAal("not-a-jwt")).toBeNull();
    expect(jwtAal(undefined)).toBeNull();
    // Non-ASCII claims decode too (an accented email in the token).
    expect(jwtAal(token({ aal: "aal2", email: "zoë@example.org" }))).toBe("aal2");
  });

  test("only a verified factor counts", () => {
    expect(hasVerifiedFactor({ factors: [{ status: "unverified" }] })).toBe(false);
    expect(hasVerifiedFactor({ factors: [{ status: "unverified" }, { status: "verified" }] })).toBe(true);
    expect(hasVerifiedFactor({ factors: null })).toBe(false);
    expect(hasVerifiedFactor(null)).toBe(false);
  });

  test("aal1 without a factor → enroll, aal1 with one → verify, aal2 → ok, no user → anonymous", () => {
    expect(twoStepStatus({ hasUser: true, aal: "aal1", verifiedFactor: false })).toBe("enroll");
    expect(twoStepStatus({ hasUser: true, aal: "aal1", verifiedFactor: true })).toBe("verify");
    expect(twoStepStatus({ hasUser: true, aal: "aal2", verifiedFactor: true })).toBe("ok");
    expect(twoStepStatus({ hasUser: true, aal: null, verifiedFactor: false })).toBe("enroll");
    expect(twoStepStatus({ hasUser: false, aal: null, verifiedFactor: false })).toBe("anonymous");
  });

  test("next only ever returns inside /admin or /board, never to the two-step screens", () => {
    expect(safeTwoStepNext("/admin/finance?x=1")).toBe("/admin/finance?x=1");
    expect(safeTwoStepNext("/board/meetings/abc")).toBe("/board/meetings/abc");
    expect(safeTwoStepNext("https://evil.example.org")).toBe("/admin/today");
    expect(safeTwoStepNext("//evil.example.org")).toBe("/admin/today");
    expect(safeTwoStepNext("/\\evil.example.org")).toBe("/admin/today");
    expect(safeTwoStepNext("/teens")).toBe("/admin/today");
    expect(safeTwoStepNext("/administrator")).toBe("/admin/today");
    expect(safeTwoStepNext(TWO_STEP_VERIFY_PATH)).toBe("/admin/today");
    expect(safeTwoStepNext(null)).toBe("/admin/today");
  });

  test("page decisions", () => {
    const r = (s: TwoStepStatus, path: string, search = "", next: string | null = null) =>
      twoStepPageRedirect(s, path, search, next);
    expect(r("enroll", "/admin/finance", "?tab=1")).toBe(`${TWO_STEP_ENROLL_PATH}?next=${encodeURIComponent("/admin/finance?tab=1")}`);
    expect(r("verify", "/board/meetings/m1")).toBe(`${TWO_STEP_VERIFY_PATH}?next=${encodeURIComponent("/board/meetings/m1")}`);
    expect(r("verify", "/admin")).toBe(TWO_STEP_VERIFY_PATH);
    expect(r("ok", "/admin/finance")).toBeNull();
    expect(r("anonymous", "/admin/finance")).toBeNull();
    // On the screens themselves.
    expect(r("enroll", TWO_STEP_ENROLL_PATH)).toBeNull();
    expect(r("verify", TWO_STEP_VERIFY_PATH)).toBeNull();
    expect(r("verify", TWO_STEP_ENROLL_PATH, "", "/admin/ops")).toBe(`${TWO_STEP_VERIFY_PATH}?next=${encodeURIComponent("/admin/ops")}`);
    expect(r("enroll", TWO_STEP_VERIFY_PATH)).toBe(TWO_STEP_ENROLL_PATH);
    expect(r("ok", TWO_STEP_VERIFY_PATH, "", "/board")).toBe("/board");
    expect(r("ok", TWO_STEP_ENROLL_PATH, "", "https://evil.example.org")).toBe("/admin/today");
    expect(r("anonymous", TWO_STEP_VERIFY_PATH)).toBe("/admin");
  });

  test("API decisions: 401 with a clear error, except sign-in/out and anonymous calls", () => {
    const enroll = twoStepApiRefusal("enroll", "/api/admin/finance/config");
    expect(enroll).toMatchObject({ status: 401, body: { code: "two_step_required", step: "enroll", url: TWO_STEP_ENROLL_PATH } });
    expect(enroll!.body.error).toMatch(/Two-step login is required/);
    expect(twoStepApiRefusal("verify", "/api/reed/ask")).toMatchObject({ status: 401, body: { step: "verify" } });
    expect(twoStepApiRefusal("verify", "/api/board/documents")).toMatchObject({ status: 401 });
    expect(twoStepApiRefusal("ok", "/api/admin/finance/config")).toBeNull();
    expect(twoStepApiRefusal("anonymous", "/api/admin/finance/config")).toBeNull();
    for (const p of ["/api/admin/login", "/api/admin/logout", "/api/admin/account/password/reset-link", "/api/board/signin", "/api/board/signout"]) {
      expect(twoStepApiRefusal("verify", p), p).toBeNull();
    }
  });
});

// ── middleware, end to end with a stubbed session ────────────────────────────

const session = { hasUser: true, twoStep: "ok" as TwoStepStatus };
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => ({
    response: NextResponse.next(),
    hasUser: session.hasUser,
    userId: session.hasUser ? "u1" : null,
    supabase: null,
    twoStep: session.twoStep,
  })),
}));

import { middleware } from "@/middleware";

const get = (path: string) => middleware(new NextRequest(`http://localhost${path}`));
const location = (res: Response) => {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname + new URL(l).search : null;
};

describe("middleware", () => {
  beforeEach(() => {
    session.hasUser = true;
    session.twoStep = "ok";
  });

  test("aal1 without a factor: every admin and board page goes to enroll", async () => {
    session.twoStep = "enroll";
    for (const p of ["/admin", "/admin/today", "/admin/settings/people", "/board", "/board/meetings/m1"]) {
      const res = await get(p);
      expect(res.status, p).toBe(307);
      expect(location(res), p).toMatch(new RegExp(`^${TWO_STEP_ENROLL_PATH}`));
    }
  });

  test("aal1 with a factor: pages go to verify, keeping the destination", async () => {
    session.twoStep = "verify";
    const res = await get("/admin/finance?tab=cash");
    expect(location(res)).toBe(`${TWO_STEP_VERIFY_PATH}?next=${encodeURIComponent("/admin/finance?tab=cash")}`);
  });

  test("aal2: straight through", async () => {
    const res = await get("/admin/today");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  test("the verify screen itself renders at aal1, and sends an aal2 session on", async () => {
    session.twoStep = "verify";
    expect((await get(TWO_STEP_VERIFY_PATH)).status).toBe(200);
    session.twoStep = "ok";
    expect(location(await get(`${TWO_STEP_VERIFY_PATH}?next=/admin/ops`))).toBe("/admin/ops");
  });

  test("PWA assets stay reachable", async () => {
    session.twoStep = "enroll";
    expect((await get("/admin/manifest.webmanifest")).status).toBe(200);
  });

  test("API routes answer 401 JSON at aal1, never a redirect", async () => {
    session.twoStep = "enroll";
    const res = await get("/api/admin/finance/config");
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toMatchObject({ code: "two_step_required", step: "enroll" });

    session.twoStep = "verify";
    const reed = await get("/api/reed/ask");
    expect(reed.status).toBe(401);
    expect(await reed.json()).toMatchObject({ step: "verify" });

    // Signing out still works mid-sign-in.
    expect((await get("/api/admin/logout")).status).toBe(200);
  });

  test("API routes pass at aal2 and when anonymous (the handler answers)", async () => {
    expect((await get("/api/admin/finance/config")).status).toBe(200);
    session.hasUser = false;
    session.twoStep = "anonymous";
    expect((await get("/api/admin/finance/config")).status).toBe(200);
  });

  test("the matcher covers the board APIs", async () => {
    const src = readFileSync(join(__dirname, "../middleware.ts"), "utf8");
    expect(src).toContain('"/api/board/:path*"');
    expect(src).toContain('"/api/admin/:path*"');
  });
});

// ── the server-side backstop ─────────────────────────────────────────────────

describe("getOrgContext backstop", () => {
  test("lib/admin/auth.ts refuses a session below aal2", () => {
    const src = readFileSync(join(__dirname, "../lib/admin/auth.ts"), "utf8");
    expect(src).toMatch(/twoStepStatus\(/);
    expect(src).toMatch(/if \(status !== "ok"\) return null;/);
  });
});

// ── hardening item D: a sign-in can never create a user ──────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("shouldCreateUser: false", () => {
  const root = join(__dirname, "..");
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib"))];

  test("every signInWithOtp call passes shouldCreateUser: false", () => {
    const calls: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let i = src.indexOf("signInWithOtp(");
      while (i !== -1) {
        // The options object sits within the call; 600 chars covers it.
        const call = src.slice(i, i + 600);
        calls.push(f);
        expect(call, f).toMatch(/shouldCreateUser:\s*false/);
        i = src.indexOf("signInWithOtp(", i + 1);
      }
    }
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test("nothing anywhere sets shouldCreateUser: true or calls signUp", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/shouldCreateUser:\s*true/);
      expect(src, f).not.toMatch(/auth\.signUp\(/);
    }
  });
});
