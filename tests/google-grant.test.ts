import { describe, it, expect } from "vitest";
import { googleAccountStillInUse, type GrantRow } from "@/lib/google/grant";

// Google keeps one grant per (OAuth client, Google account): revoking any
// token from it revokes them all. Disconnecting Gmail used to revoke the same
// account's calendar connection. These pin the rule that a disconnect only
// revokes when nothing else BloomOS holds uses that account.

const row = (id: string, email: string, status = "active"): GrantRow => ({
  id,
  status,
  meta: { account_email: email },
});

const base = {
  envAccountEmail: null,
  envTokenConfigured: false,
};

describe("googleAccountStillInUse", () => {
  it("keeps the grant when the same account still has a calendar connection", () => {
    const rows = [row("gmail", "ops@org.org"), row("cal", "ops@org.org")];
    expect(
      googleAccountStillInUse({ ...base, accountEmail: "ops@org.org", excludeIds: ["gmail"], rows })
    ).toBe(true);
  });

  it("matches the account case-insensitively", () => {
    const rows = [row("gmail", "Ops@Org.org"), row("cal", "ops@org.ORG")];
    expect(
      googleAccountStillInUse({ ...base, accountEmail: "OPS@org.org", excludeIds: ["gmail"], rows })
    ).toBe(true);
  });

  it("allows the revoke when no other connection uses the account", () => {
    const rows = [row("gmail", "ops@org.org"), row("cal", "someone@else.org")];
    expect(
      googleAccountStillInUse({ ...base, accountEmail: "ops@org.org", excludeIds: ["gmail"], rows })
    ).toBe(false);
  });

  it("ignores the rows being removed and broken rows", () => {
    const rows = [row("cal1", "me@org.org"), row("cal2", "me@org.org"), row("old", "me@org.org", "error")];
    expect(
      googleAccountStillInUse({ ...base, accountEmail: "me@org.org", excludeIds: ["cal1", "cal2"], rows })
    ).toBe(false);
  });

  it("counts a half-finished pending connection as in use", () => {
    const rows = [row("gmail", "me@org.org"), row("pending", "me@org.org", "pending")];
    expect(
      googleAccountStillInUse({ ...base, accountEmail: "me@org.org", excludeIds: ["gmail"], rows })
    ).toBe(true);
  });

  it("never revokes the account behind the env GOOGLE_REFRESH_TOKEN", () => {
    expect(
      googleAccountStillInUse({
        accountEmail: "remi@ambitionangels.org",
        excludeIds: ["gmail"],
        rows: [row("gmail", "remi@ambitionangels.org")],
        envTokenConfigured: true,
        envAccountEmail: "remi@ambitionangels.org",
      })
    ).toBe(true);
  });

  it("doesn't revoke when the env token is set but its account is unknown", () => {
    expect(
      googleAccountStillInUse({
        accountEmail: "ops@org.org",
        excludeIds: ["gmail"],
        rows: [row("gmail", "ops@org.org")],
        envTokenConfigured: true,
        envAccountEmail: null,
      })
    ).toBe(true);
  });

  it("revokes another account even when the env token is set", () => {
    expect(
      googleAccountStillInUse({
        accountEmail: "ops@org.org",
        excludeIds: ["gmail"],
        rows: [row("gmail", "ops@org.org")],
        envTokenConfigured: true,
        envAccountEmail: "remi@ambitionangels.org",
      })
    ).toBe(false);
  });

  it("doesn't revoke when the account is unknown", () => {
    expect(googleAccountStillInUse({ ...base, accountEmail: null, excludeIds: [], rows: [] })).toBe(true);
  });
});
