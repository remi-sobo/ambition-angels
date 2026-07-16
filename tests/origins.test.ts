import { afterEach, beforeEach, describe, expect, test } from "vitest";

// Origin seam (core fence B4). The contract under test: APP_ORIGIN wins for
// admin links, NEXT_PUBLIC_SITE_URL keeps today's behavior when APP_ORIGIN is
// unset, the AA host is the last-resort default (emails must never render a
// relative link), and configuredAppOrigin() stays null when nothing is set so
// webhook registration skips instead of guessing.

import {
  appOrigin,
  configuredAppOrigin,
  marketingOrigin,
  adminUrl,
} from "@/lib/origins";

const KEYS = ["APP_ORIGIN", "MARKETING_ORIGIN", "NEXT_PUBLIC_SITE_URL", "VERCEL_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("appOrigin", () => {
  test("APP_ORIGIN wins, trailing slash stripped", () => {
    process.env.APP_ORIGIN = "https://app.bloomos.org/";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.ambitionangels.org";
    expect(appOrigin()).toBe("https://app.bloomos.org");
  });

  test("falls back to NEXT_PUBLIC_SITE_URL, then the AA host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    expect(appOrigin()).toBe("https://preview.example.com");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(appOrigin()).toBe("https://www.ambitionangels.org");
  });
});

describe("configuredAppOrigin", () => {
  test("null when nothing is configured (webhooks skip, never guess)", () => {
    expect(configuredAppOrigin()).toBeNull();
  });

  test("VERCEL_URL is an acceptable last resort", () => {
    process.env.VERCEL_URL = "my-branch.vercel.app";
    expect(configuredAppOrigin()).toBe("https://my-branch.vercel.app");
  });

  test("APP_ORIGIN outranks VERCEL_URL", () => {
    process.env.VERCEL_URL = "my-branch.vercel.app";
    process.env.APP_ORIGIN = "https://app.bloomos.org";
    expect(configuredAppOrigin()).toBe("https://app.bloomos.org");
  });
});

describe("marketingOrigin", () => {
  test("MARKETING_ORIGIN → NEXT_PUBLIC_SITE_URL → AA host", () => {
    expect(marketingOrigin()).toBe("https://www.ambitionangels.org");
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.ambitionangels.org";
    expect(marketingOrigin()).toBe("https://staging.ambitionangels.org");
    process.env.MARKETING_ORIGIN = "https://www.ambitionangels.org/";
    expect(marketingOrigin()).toBe("https://www.ambitionangels.org");
  });

  test("marketing links do not move when APP_ORIGIN flips at cutover", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.ambitionangels.org";
    process.env.APP_ORIGIN = "https://app.bloomos.org";
    expect(marketingOrigin()).toBe("https://www.ambitionangels.org");
    expect(appOrigin()).toBe("https://app.bloomos.org");
  });
});

describe("adminUrl", () => {
  test("joins paths against the app origin", () => {
    process.env.APP_ORIGIN = "https://app.bloomos.org";
    expect(adminUrl()).toBe("https://app.bloomos.org/admin");
    expect(adminUrl("/admin/ops")).toBe("https://app.bloomos.org/admin/ops");
    expect(adminUrl("admin/ops")).toBe("https://app.bloomos.org/admin/ops");
  });
});
