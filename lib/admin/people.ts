import type { OrgContext } from "./auth";

/**
 * Settings → People and roles (V4 Stage A): the rules, as pure functions so
 * tests/people-roles.test.ts runs them on fixtures. The API routes
 * (app/api/admin/settings/people/*) call these after requirePermission
 * ("members.manage") and before any write; nothing here reads a database.
 *
 * The rules:
 *  1. Only owners and admins manage people (members.manage, checked on the
 *     server by the route guard and again by memberships RLS).
 *  2. Only an owner can make someone an owner, or change or remove an owner.
 *  3. Nobody changes their own role or removes themselves here: that is how a
 *     person locks themselves out by accident. Another owner or admin does it.
 *  4. An org always keeps at least one owner: the last owner can be neither
 *     demoted nor removed.
 *  5. Everything is scoped to the ACTIVE org. A user id that has no
 *     membership in the active org is "not found", never another org's row.
 *  6. "Reset two-step login" (deletes the person's authenticators so they set
 *     one up again at next sign-in) follows rules 1 to 3 and 5: owners and
 *     admins only, only an owner resets an owner, never yourself.
 */

export type MemberRole = OrgContext["role"];

export const MEMBER_ROLES: readonly { value: MemberRole; label: string; blurb: string }[] = [
  { value: "owner", label: "Owner", blurb: "Everything, including people, roles and setup. At least one per organization." },
  { value: "admin", label: "Admin", blurb: "Everything an owner can do, except managing owners." },
  { value: "staff", label: "Staff", blurb: "Day-to-day programs, fundraising and work. Can see finance, not change it." },
  { value: "finance", label: "Finance", blurb: "Finance and reports." },
  { value: "board_viewer", label: "Board viewer", blurb: "Read-only board materials and reports." },
];

export function isMemberRole(v: unknown): v is MemberRole {
  return typeof v === "string" && MEMBER_ROLES.some((r) => r.value === v);
}

export function roleLabel(role: string): string {
  return MEMBER_ROLES.find((r) => r.value === role)?.label ?? role;
}

/** A plausible email, lowercased and trimmed; null when it isn't one. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(e)) return null;
  return e;
}

export type RuleResult = { ok: true } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const no = (status: 400 | 403 | 404 | 409, error: string): RuleResult => ({ ok: false, status, error });

type Actor = { userId: string; role: MemberRole };
type Target = { userId: string; role: MemberRole } | null;

/** May `actor` invite someone into the active org with `role`? */
export function checkInvite(actor: Actor, role: unknown): RuleResult {
  if (!isMemberRole(role)) return no(400, "Choose a role.");
  if (role === "owner" && actor.role !== "owner") return no(403, "Only an owner can invite another owner.");
  return { ok: true };
}

/** May `actor` change `target`'s role to `role`, with `ownerCount` owners now? */
export function checkRoleChange(actor: Actor, target: Target, role: unknown, ownerCount: number): RuleResult {
  if (!target) return no(404, "That person is not in this organization.");
  if (!isMemberRole(role)) return no(400, "Choose a role.");
  if (target.userId === actor.userId) return no(403, "You can't change your own role. Ask another owner or admin.");
  if ((role === "owner" || target.role === "owner") && actor.role !== "owner")
    return no(403, "Only an owner can change who is an owner.");
  if (target.role === role) return { ok: true };
  if (target.role === "owner" && role !== "owner" && ownerCount <= 1)
    return no(409, "This is the only owner. Make someone else an owner first.");
  return { ok: true };
}

/** May `actor` remove `target` from the active org, with `ownerCount` owners now? */
export function checkRemove(actor: Actor, target: Target, ownerCount: number): RuleResult {
  if (!target) return no(404, "That person is not in this organization.");
  if (target.userId === actor.userId) return no(403, "You can't remove yourself. Ask another owner or admin.");
  if (target.role === "owner" && actor.role !== "owner") return no(403, "Only an owner can remove an owner.");
  if (target.role === "owner" && ownerCount <= 1) return no(409, "This is the only owner. Make someone else an owner first.");
  return { ok: true };
}

/** May `actor` reset `target`'s two-step login in the active org? */
export function checkTwoStepReset(actor: Actor, target: Target): RuleResult {
  if (!target) return no(404, "That person is not in this organization.");
  if (target.userId === actor.userId)
    return no(403, "You can't reset your own two-step login. Manage your authenticators in Your account, or ask another owner or admin.");
  if (target.role === "owner" && actor.role !== "owner") return no(403, "Only an owner can reset an owner's two-step login.");
  return { ok: true };
}

/** What the screen offers on one row (the server re-checks every write). */
export function rowPermissions(actor: Actor, target: { userId: string; role: MemberRole }, ownerCount: number) {
  const isSelf = actor.userId === target.userId;
  const canTouch = !isSelf && (target.role !== "owner" || actor.role === "owner");
  const lastOwner = target.role === "owner" && ownerCount <= 1;
  return {
    isSelf,
    canChangeRole: canTouch && !lastOwner,
    canRemove: canTouch && !lastOwner,
    /** Reset two-step login: same reach as a role change, last owner included
     *  (resetting does not remove them). */
    canResetTwoStep: canTouch,
    /** Roles this actor may pick for the row. */
    roleChoices: MEMBER_ROLES.filter((r) => r.value !== "owner" || actor.role === "owner").map((r) => r.value),
  };
}
