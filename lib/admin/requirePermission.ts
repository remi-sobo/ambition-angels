import { getOrgContext, ctxHasPermission, type OrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature, type FeatureKey } from "@/lib/admin/entitlements";

/**
 * The ONE server-side role guard for BloomOS admin code that runs on the
 * service-role client (pre-SafeSpace hardening item 3).
 *
 * The service-role client bypasses RLS, so the `has_permission(org_id, perm)`
 * gate every RLS policy carries is silently skipped. Checking only "is a
 * member of the active org" lets a board_viewer edit finance, students and
 * board records, and lets a finance user read the student roster. Every
 * /api/admin handler and every app/admin page that reads or writes through
 * getSupabaseAdmin must re-assert the module's permission here first.
 *
 * Rule:
 *   1. a session and a membership in the ACTIVE org (getOrgContext resolves
 *      the active-org cookie only among the user's own memberships; a forged
 *      cookie falls back to the user's oldest membership) — else 401;
 *   2. optionally, the active org holds an entitlement — else 402 (the same
 *      upsell boundary requireEntitlement returns);
 *   3. the caller's role holds the permission in `role_permissions`, checked
 *      through ctxHasPermission (a permission, never a role name, so a role
 *      change stays a data change, exactly like the RLS helper) — else 403.
 *      An array means ANY of the listed permissions opens the gate (e.g. the
 *      import wizard serves program and fundraising).
 *
 * Route handlers:
 *   const gate = await requirePermission("finance.write");
 *   if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
 *   const ctx = gate.ctx;
 *
 * Server-component pages use requirePagePermission
 * (app/admin/_components/PermissionGate.tsx), which calls this function and
 * renders the standard not-authorized panel on refusal.
 *
 * tests/role-guard-coverage.test.ts fails CI when an /api/admin write handler
 * or an app/admin page on the service-role client skips this guard.
 */

/** Every permission seeded into role_permissions by supabase/migrations
 *  (create_bloomos_core, notifications_spine, create_messaging,
 *  entity_comments, documents_schema, metrics_catalog_schema,
 *  bloomos_staff_phase1, comms_gmail_g2, capture_use_permission). A typo is a compile error, and an
 *  unknown string here would match no role and lock everyone out. */
export const PERMISSIONS = [
  "org.manage",
  "members.manage",
  "program.read",
  "program.write",
  "fundraising.read",
  "fundraising.write",
  "finance.read",
  "finance.write",
  "ops.read",
  "ops.write",
  "board.read",
  "board.write",
  "compliance.read",
  "compliance.write",
  "reports.read",
  "reports.approve",
  "staff.read",
  "staff.write",
  "staff.manage",
  "documents.read",
  "documents.write",
  "documents.delete",
  "documents.admin",
  "metrics.read",
  "metrics.write",
  "metrics.admin",
  "messages.read",
  "messages.write",
  "notifications.read",
  "notifications.write",
  "comments.read",
  "comments.write",
  "comms.send",
  // Talk to log for every role: record and keep your own captures. Filing a
  // card still needs the destination's permission (lib/capture/cardKind.ts).
  "capture.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Module → read/write permission. Each module maps to the permission its
 * tables' RLS policies already use, so the service-role path enforces exactly
 * what the session path would. Modules with no permission of their own map to
 * the closest existing one (noted inline); no new permission is invented.
 */
export const MODULE_PERMISSIONS = {
  finance: { read: "finance.read", write: "finance.write" },
  fundraising: { read: "fundraising.read", write: "fundraising.write" },
  // Students, cohorts, sessions, attendance, applications, coach, partners,
  // YGB and Demo Day: their tables' RLS uses program.*.
  program: { read: "program.read", write: "program.write" },
  // Ops tasks, projects, agenda blocks, meetings and the booking page
  // (meeting_types / bookings / blackouts / meeting_records RLS is ops.*).
  ops: { read: "ops.read", write: "ops.write" },
  board: { read: "board.read", write: "board.write" },
  compliance: { read: "compliance.read", write: "compliance.write" },
  staff: { read: "staff.read", write: "staff.write" },
  documents: { read: "documents.read", write: "documents.write" },
  metrics: { read: "metrics.read", write: "metrics.write" },
  reports: { read: "reports.read", write: "reports.approve" },
  // Strategic plan writes are org.manage (the existing plan/* routes and the
  // plan_* RLS); reads are reports.read (plan_reviews / plan_archives RLS).
  strategy: { read: "reports.read", write: "org.manage" },
  org: { read: "org.manage", write: "org.manage" },
} as const satisfies Record<string, { read: Permission; write: Permission }>;

export type Module = keyof typeof MODULE_PERMISSIONS;

export type PermissionResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; status: 401 | 402 | 403; error: string };

export type RequirePermissionOptions = {
  /** Also require the active org to hold this entitlement (402 otherwise). */
  entitlement?: FeatureKey;
};

/** True when the caller's role holds ANY of the permissions. */
export async function ctxHasAnyPermission(
  ctx: OrgContext,
  perm: Permission | readonly Permission[],
): Promise<boolean> {
  const perms: readonly Permission[] = typeof perm === "string" ? [perm] : perm;
  for (const p of perms) {
    if (await ctxHasPermission(ctx, p)) return true;
  }
  return false;
}

export async function requirePermission(
  perm: Permission | readonly Permission[],
  opts: RequirePermissionOptions = {},
): Promise<PermissionResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (opts.entitlement && !hasFeature(await getEntitlements(ctx.orgId), opts.entitlement)) {
    return { ok: false, status: 402, error: `This feature requires an upgrade (${opts.entitlement}).` };
  }
  if (!(await ctxHasAnyPermission(ctx, perm))) {
    return { ok: false, status: 403, error: "You don't have permission to do that." };
  }
  return { ok: true, ctx };
}

/** Shorthand: the module's read or write permission. */
export function requireModule(
  module: Module,
  verb: "read" | "write",
  opts: RequirePermissionOptions = {},
): Promise<PermissionResult> {
  return requirePermission(MODULE_PERMISSIONS[module][verb], opts);
}
