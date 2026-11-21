import type { FeatureKey } from "./entitlements";
import type { Module, Permission } from "./requirePermission";

/**
 * Which role permission a nav tab needs before the shell shows it (V4 A2,
 * after the server-side role guard landed in #593).
 *
 * PURE and client-safe (type-only imports): the sidebar, mobile bar, How-To
 * and search all resolve through resolveShellNav, so a destination a role
 * cannot open is hidden everywhere at once instead of opening onto the
 * not-authorized panel. The module for each feature key follows the guard's
 * own module map (MODULE_PERMISSIONS in lib/admin/requirePermission.ts, which
 * is server-only); tests/nav-permissions.test.ts asserts the two agree.
 *
 * Tabs with no feature (Today, Organization Health, Inbox) need nothing.
 */
export const FEATURE_MODULE: Partial<Record<FeatureKey, Module>> = {
  "modules.finance": "finance",
  "modules.fundraising": "fundraising",
  // Comms → Emails sends to fundraising segments; its seat lived under
  // Fundraising and its tables read through fundraising.read.
  "modules.comms": "fundraising",
  "modules.program": "program",
  "modules.partners": "program",
  "modules.content": "program",
  "aa.coach": "program",
  "modules.ops": "ops",
  // Meetings, My Week and the booking page: meeting tables' RLS is ops.*.
  "modules.meetings": "ops",
  "modules.board": "board",
  "modules.compliance": "compliance",
  "modules.staff": "staff",
  "modules.documents": "documents",
  "modules.metrics": "metrics",
  "aa.site_analytics": "metrics",
  "modules.strategy": "strategy",
};

/** The read permission each guard module needs (a copy of
 *  MODULE_PERMISSIONS[module].read; the test keeps them in step). */
export const MODULE_READ: Record<Module, Permission> = {
  finance: "finance.read",
  fundraising: "fundraising.read",
  program: "program.read",
  ops: "ops.read",
  board: "board.read",
  compliance: "compliance.read",
  staff: "staff.read",
  documents: "documents.read",
  metrics: "metrics.read",
  reports: "reports.read",
  strategy: "reports.read",
  org: "org.manage",
};

/** Feature keys outside the module map with a permission of their own. */
const FEATURE_EXTRA: Partial<Record<FeatureKey, Permission>> = {
  "modules.messages": "messages.read",
};

/** The permission a tab gated on `feature` needs, or null for none. */
export function tabPermission(feature?: FeatureKey): Permission | null {
  if (!feature) return null;
  const mod = FEATURE_MODULE[feature];
  if (mod) return MODULE_READ[mod];
  return FEATURE_EXTRA[feature] ?? null;
}
