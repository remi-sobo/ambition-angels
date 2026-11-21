import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkTwoStepReset, rowPermissions } from "@/lib/admin/people";
import { checkFactorRemoval } from "@/lib/auth/twoStep";

/**
 * Recovery for two-step login (pre-SafeSpace item D). Supabase TOTP has no
 * recovery codes, so an owner or admin resets a member's two-step login in
 * People and roles: members.manage, the ACTIVE org only, never yourself, and
 * only an owner resets an owner. A person can remove their own
 * authenticators, never the last one.
 */

const owner = { userId: "u-owner", role: "owner" as const };
const admin = { userId: "u-admin", role: "admin" as const };

describe("checkTwoStepReset", () => {
  test("an owner or admin resets a staff member", () => {
    expect(checkTwoStepReset(owner, { userId: "u-staff", role: "staff" })).toEqual({ ok: true });
    expect(checkTwoStepReset(admin, { userId: "u-staff", role: "staff" })).toEqual({ ok: true });
  });

  test("never yourself", () => {
    expect(checkTwoStepReset(owner, { userId: "u-owner", role: "owner" })).toMatchObject({ ok: false, status: 403 });
  });

  test("only an owner resets an owner", () => {
    expect(checkTwoStepReset(admin, { userId: "u-o2", role: "owner" })).toMatchObject({ ok: false, status: 403 });
    expect(checkTwoStepReset(owner, { userId: "u-o2", role: "owner" })).toEqual({ ok: true });
  });

  test("someone outside the active org is not found", () => {
    expect(checkTwoStepReset(owner, null)).toMatchObject({ ok: false, status: 404 });
  });

  test("the row offers it on the same terms, the last owner included", () => {
    expect(rowPermissions(owner, { userId: "u-owner", role: "owner" }, 1).canResetTwoStep).toBe(false);
    expect(rowPermissions(admin, { userId: "u-o2", role: "owner" }, 2).canResetTwoStep).toBe(false);
    expect(rowPermissions(owner, { userId: "u-o2", role: "owner" }, 1).canResetTwoStep).toBe(true);
    expect(rowPermissions(admin, { userId: "u-staff", role: "staff" }, 1).canResetTwoStep).toBe(true);
  });
});

describe("checkFactorRemoval", () => {
  test("never the last verified authenticator", () => {
    expect(checkFactorRemoval([{ id: "f1", status: "verified" }], "f1")).toMatchObject({ ok: false, status: 409 });
  });
  test("one of two may go; an abandoned unverified one always may", () => {
    const two = [
      { id: "f1", status: "verified" },
      { id: "f2", status: "verified" },
    ];
    expect(checkFactorRemoval(two, "f2")).toEqual({ ok: true });
    expect(checkFactorRemoval([{ id: "f1", status: "verified" }, { id: "f3", status: "unverified" }], "f3")).toEqual({ ok: true });
  });
  test("a factor that isn't yours is 404", () => {
    expect(checkFactorRemoval([{ id: "f1", status: "verified" }], "f9")).toMatchObject({ ok: false, status: 404 });
  });
});

// ── the reset route ──────────────────────────────────────────────────────────

const ORG = "00000000-0000-0000-0000-0000000000a1";
const TARGET = "11111111-1111-4111-8111-111111111111";
let gate: { ok: true; ctx: { userId: string; role: string; orgId: string } } | { ok: false; status: number; error: string };
let membership: { userId: string; role: string } | null;
const resets: string[] = [];
const audits: { action: string }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/requirePermission", () => ({
  requirePermission: vi.fn(async (perm: string) => {
    expect(perm).toBe("members.manage");
    return gate;
  }),
}));
vi.mock("@/lib/admin/people-server", () => ({
  getMembership: vi.fn(async (orgId: string, userId: string) => (orgId === ORG && userId === TARGET ? membership : null)),
  resetTwoStep: vi.fn(async (userId: string) => {
    resets.push(userId);
    return { ok: true, removed: 1 };
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async (_r: unknown, e: { action: string }) => void audits.push(e)) }));

import { DELETE } from "@/app/api/admin/settings/people/[userId]/two-step/route";

const call = (userId: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/settings/people/${userId}/two-step`, { method: "DELETE" }), {
    params: { userId },
  });

describe("DELETE /api/admin/settings/people/[userId]/two-step", () => {
  beforeEach(() => {
    gate = { ok: true, ctx: { userId: "u-admin", role: "admin", orgId: ORG } };
    membership = { userId: TARGET, role: "staff" };
    resets.length = 0;
    audits.length = 0;
  });

  test("resets a staff member of the active org and audits it", async () => {
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(resets).toEqual([TARGET]);
    expect(audits.map((a) => a.action)).toEqual(["members.two_step.reset"]);
  });

  test("without members.manage nothing happens", async () => {
    gate = { ok: false, status: 403, error: "You don't have permission to do that." };
    expect((await call(TARGET)).status).toBe(403);
    expect(resets).toEqual([]);
  });

  test("an admin cannot reset an owner", async () => {
    membership = { userId: TARGET, role: "owner" };
    expect((await call(TARGET)).status).toBe(403);
    expect(resets).toEqual([]);
  });

  test("a user outside the active org is 404, never reset", async () => {
    expect((await call("22222222-2222-4222-8222-222222222222")).status).toBe(404);
    expect(resets).toEqual([]);
  });

  test("never yourself", async () => {
    gate = { ok: true, ctx: { userId: TARGET, role: "owner", orgId: ORG } };
    membership = { userId: TARGET, role: "owner" };
    expect((await call(TARGET)).status).toBe(403);
    expect(resets).toEqual([]);
  });
});
