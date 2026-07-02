import { beforeEach, describe, expect, test, vi } from "vitest";

// Comms v2 Phase 1: UNSUBSCRIBE_SECRET is required — no fallback chain. A
// missing secret must fail closed (throw), never produce a forgeable token.

const CID = "9f3a1c2e-0000-4000-8000-000000000001";

async function load(secret?: string) {
  vi.resetModules();
  if (secret === undefined) delete process.env.UNSUBSCRIBE_SECRET;
  else process.env.UNSUBSCRIBE_SECRET = secret;
  return import("@/lib/fundraising/unsubscribe");
}

describe("unsubscribe tokens", () => {
  beforeEach(() => {
    delete process.env.UNSUBSCRIBE_SECRET;
  });

  test("round-trip: token verifies for its constituent", async () => {
    const mod = await load("test-secret");
    const token = mod.unsubscribeToken(CID);
    expect(token).toHaveLength(32);
    expect(mod.verifyUnsubscribe(CID, token)).toBe(true);
  });

  test("wrong token and wrong constituent both fail", async () => {
    const mod = await load("test-secret");
    const token = mod.unsubscribeToken(CID);
    expect(mod.verifyUnsubscribe(CID, token.replace(/./, "0"))).toBe(false);
    expect(mod.verifyUnsubscribe("9f3a1c2e-0000-4000-8000-000000000002", token)).toBe(false);
  });

  test("tokens differ across secrets (no static fallback)", async () => {
    const a = (await load("secret-a")).unsubscribeToken(CID);
    const b = (await load("secret-b")).unsubscribeToken(CID);
    expect(a).not.toBe(b);
  });

  test("missing secret fails closed: signing throws instead of falling back", async () => {
    const mod = await load(undefined);
    expect(() => mod.unsubscribeToken(CID)).toThrow(/UNSUBSCRIBE_SECRET/);
    expect(() => mod.unsubscribeUrl(CID)).toThrow(/UNSUBSCRIBE_SECRET/);
  });

  test("unsubscribeUrl carries the token and optional campaign attribution", async () => {
    const mod = await load("test-secret");
    const plain = mod.unsubscribeUrl(CID);
    expect(plain).toContain(`c_id=${CID}`);
    expect(plain).toContain(`t=${mod.unsubscribeToken(CID)}`);
    expect(plain).not.toContain("&c=");

    const campaign = "1b2c3d4e-0000-4000-8000-0000000000aa";
    expect(mod.unsubscribeUrl(CID, campaign)).toContain(`&c=${campaign}`);
  });
});
