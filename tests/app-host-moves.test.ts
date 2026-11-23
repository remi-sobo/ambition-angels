import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Repo split phase 1c (specs/bloomos-repo-split.md §6c, §6f): board, meet,
// Strategy Room, coach private pages, unsubscribe and booking links are
// BloomOS features on app.bloomos.org. Old ambitionangels.org links 308 there;
// the app host serves them instead of 404ing.

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => ({
    response: NextResponse.next(),
    hasUser: false,
    userId: null,
    supabase: null,
    twoStep: "ok",
  })),
}));

import { middleware, movedToAppHost } from "@/middleware";
import { manageUrl } from "@/lib/email/format";

const at = (host: string, path: string, method = "GET") =>
  middleware(new NextRequest(`https://${host}${path}`, { method, headers: { host } }));

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://app.bloomos.org");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("movedToAppHost", () => {
  test.each([
    "/board",
    "/board/meetings/abc",
    "/meet",
    "/meet/intro-call",
    "/meet/booked/tok123",
    "/strategy",
    "/coach/me/tok123",
    "/api/unsubscribe",
    "/api/meet/booking/tok123/cancel",
    "/api/meet/booking/tok123/reschedule",
  ])("%s moved", (p) => expect(movedToAppHost(p)).toBe(true));

  test.each([
    "/",
    "/coach",
    "/boardroom",
    "/meeting",
    "/strategy/extra",
    "/api/meet/availability",
    "/api/meet/booking/tok123",
    "/teens",
    "/admin",
  ])("%s stays", (p) => expect(movedToAppHost(p)).toBe(false));
});

describe("marketing host redirects", () => {
  test("an old board deep link keeps its path and query", async () => {
    const res = await at("www.ambitionangels.org", "/board/meetings/abc?tab=docs");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.bloomos.org/board/meetings/abc?tab=docs");
  });

  test("a POSTed unsubscribe or booking action keeps its method (308)", async () => {
    const u = await at("ambitionangels.org", "/api/unsubscribe?c_id=1&t=x", "POST");
    expect(u.status).toBe(308);
    expect(u.headers.get("location")).toBe("https://app.bloomos.org/api/unsubscribe?c_id=1&t=x");
    const b = await at("www.ambitionangels.org", "/api/meet/booking/tok/cancel", "POST");
    expect(b.status).toBe(308);
    expect(b.headers.get("location")).toBe("https://app.bloomos.org/api/meet/booking/tok/cancel");
  });

  test("meet, strategy and coach links redirect", async () => {
    for (const p of ["/meet/intro-call", "/strategy", "/coach/me/tok"]) {
      const res = await at("www.ambitionangels.org", p);
      expect(res.status, p).toBe(308);
      expect(res.headers.get("location")).toBe(`https://app.bloomos.org${p}`);
    }
  });

  test("the public coach sign-up and the site stay put", async () => {
    for (const p of ["/coach", "/", "/teens"]) {
      const res = await at("www.ambitionangels.org", p);
      expect(res.status, p).not.toBe(308);
    }
  });

  test("previews and localhost are left alone", async () => {
    for (const host of ["localhost", "ambition-angels-abc123.vercel.app"]) {
      const res = await at(host, "/board/signin");
      expect(res.status, host).not.toBe(308);
    }
  });

  test("no APP_ORIGIN configured → no redirect rather than a guess", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    const res = await at("www.ambitionangels.org", "/meet");
    expect(res.status).not.toBe(308);
  });
});

describe("app host serves the moved pages", () => {
  test.each(["/board/signin", "/meet", "/meet/intro-call", "/strategy", "/coach/me/tok"])(
    "%s is not a host-guard 404",
    async (p) => {
      const res = await at("app.bloomos.org", p);
      expect(res.status).not.toBe(404);
    },
  );

  test("marketing pages still 404 on the app host", async () => {
    const res = await at("app.bloomos.org", "/about");
    expect(res.status).toBe(404);
  });
});

describe("email links point at the app host", () => {
  test("manage-booking link", () => {
    expect(manageUrl("tok")).toBe("https://app.bloomos.org/meet/booked/tok");
  });
});
