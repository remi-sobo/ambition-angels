import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { marketingOrigin } from "@/lib/origins";

// The website's own origin for absolute links: MARKETING_ORIGIN, then
// NEXT_PUBLIC_SITE_URL, then the production host (an email must never render
// a relative link).

const KEYS = ["MARKETING_ORIGIN", "NEXT_PUBLIC_SITE_URL"] as const;
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

describe("marketingOrigin", () => {
  test("MARKETING_ORIGIN wins, trailing slash stripped", () => {
    process.env.MARKETING_ORIGIN = "https://www.ambitionangels.org/";
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    expect(marketingOrigin()).toBe("https://www.ambitionangels.org");
  });

  test("falls back to NEXT_PUBLIC_SITE_URL, then the production host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
    expect(marketingOrigin()).toBe("https://preview.example.com");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(marketingOrigin()).toBe("https://www.ambitionangels.org");
  });
});
