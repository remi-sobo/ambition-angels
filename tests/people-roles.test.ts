import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkInvite,
  checkRemove,
  checkRoleChange,
  isMemberRole,
  normalizeEmail,
  rowPermissions,
} from "@/lib/admin/people";

// Settings → People and roles (V4 Stage A3): the rules in lib/admin/people.ts,
// and source checks that the routes and page call the guard and pin the
// active org. Fixtures are invented ids and example.org addresses.

const OWNER = { userId: "u-owner", role: "owner" as const };
const OWNER2 = { userId: "u-owner-2", role: "owner" as const };
const ADMIN = { userId: "u-admin", role: "admin" as const };
const STAFF = { userId: "u-staff", role: "staff" as const };

describe("invite", () => {
  test("validates the role and keeps owner invites for owners", () => {
    expect(checkInvite(ADMIN, "staff").ok).toBe(true);
    expect(checkInvite(ADMIN, "owner")).toMatchObject({ ok: false, status: 403 });
    expect(checkInvite(OWNER, "owner").ok).toBe(true);
    expect(checkInvite(OWNER, "superuser")).toMatchObject({ ok: false, status: 400 });
  });

  test("normalizes emails and rejects what is not one", () => {
    expect(normalizeEmail("  New.Person@Example.ORG ")).toBe("new.person@example.org");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("a@example.org, b@example.org")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe("role change", () => {
  test("the last owner can never be demoted", () => {
    expect(checkRoleChange(OWNER2, OWNER, "admin", 1)).toMatchObject({ ok: false, status: 409 });
    expect(checkRoleChange(OWNER2, OWNER, "admin", 2).ok).toBe(true);
  });

  test("nobody changes their own role", () => {
    expect(checkRoleChange(OWNER, OWNER, "admin", 3)).toMatchObject({ ok: false, status: 403 });
    expect(checkRoleChange(ADMIN, ADMIN, "staff", 1)).toMatchObject({ ok: false, status: 403 });
  });

  test("only owners make or unmake owners", () => {
    expect(checkRoleChange(ADMIN, STAFF, "owner", 1)).toMatchObject({ ok: false, status: 403 });
    expect(checkRoleChange(ADMIN, OWNER, "staff", 2)).toMatchObject({ ok: false, status: 403 });
    expect(checkRoleChange(OWNER, STAFF, "owner", 1).ok).toBe(true);
    expect(checkRoleChange(ADMIN, STAFF, "finance", 1).ok).toBe(true);
  });

  test("a target outside the active org is not found", () => {
    expect(checkRoleChange(OWNER, null, "staff", 1)).toMatchObject({ ok: false, status: 404 });
    expect(checkRoleChange(OWNER, STAFF, "root", 1)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("remove", () => {
  test("never the last owner, never yourself, owners only by owners", () => {
    expect(checkRemove(OWNER2, OWNER, 1)).toMatchObject({ ok: false, status: 409 });
    expect(checkRemove(OWNER2, OWNER, 2).ok).toBe(true);
    expect(checkRemove(OWNER, OWNER, 2)).toMatchObject({ ok: false, status: 403 });
    expect(checkRemove(ADMIN, OWNER, 2)).toMatchObject({ ok: false, status: 403 });
    expect(checkRemove(ADMIN, STAFF, 1).ok).toBe(true);
    expect(checkRemove(ADMIN, null, 1)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("what the screen offers", () => {
  test("rows match the server rules", () => {
    expect(rowPermissions(OWNER, OWNER, 1)).toMatchObject({ isSelf: true, canChangeRole: false, canRemove: false });
    expect(rowPermissions(OWNER2, OWNER, 1)).toMatchObject({ canChangeRole: false, canRemove: false });
    expect(rowPermissions(ADMIN, OWNER, 2)).toMatchObject({ canChangeRole: false, canRemove: false });
    expect(rowPermissions(ADMIN, STAFF, 1)).toMatchObject({ canChangeRole: true, canRemove: true });
    expect(rowPermissions(ADMIN, STAFF, 1).roleChoices).not.toContain("owner");
    expect(rowPermissions(OWNER, STAFF, 1).roleChoices).toContain("owner");
    expect(isMemberRole("board_viewer")).toBe(true);
  });
});

describe("server enforcement (source checks)", () => {
  const root = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  test("every handler and the page guard on members.manage", () => {
    const list = read("app/api/admin/settings/people/route.ts");
    const one = read("app/api/admin/settings/people/[userId]/route.ts");
    expect(list).toMatch(/export async function POST[\s\S]*requirePermission\("members\.manage"\)/);
    expect(one.match(/requirePermission\("members\.manage"\)/g)?.length).toBe(2);
    expect(read("app/admin/settings/people/page.tsx")).toMatch(/requirePagePermission\("members\.manage"/);
  });

  test("every membership write is pinned to the active org", () => {
    const src = read("lib/admin/people-server.ts");
    for (const m of Array.from(src.matchAll(/from\("memberships"\)([\s\S]{0,240})/g))) {
      const chain = m[1];
      if (/\.(update|delete)\(/.test(chain)) expect(chain).toMatch(/\.eq\("org_id", orgId\)/);
      if (/\.upsert\(/.test(chain)) expect(chain).toMatch(/org_id: orgId/);
    }
    // The routes take the org from the guard's context, never from the body.
    for (const p of ["app/api/admin/settings/people/route.ts", "app/api/admin/settings/people/[userId]/route.ts"]) {
      expect(read(p)).not.toMatch(/body\??\.org_id|orgId:\s*body/);
    }
  });

  test("the writes go through saveAction with no optimistic update", () => {
    const src = read("app/admin/settings/people/_components/PeopleControls.tsx");
    expect(src).toMatch(/useSaveAction/);
    expect(src).not.toMatch(/optimistic:/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});
