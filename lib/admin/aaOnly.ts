import { getOrgContext, ctxHasPermission, type OrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature, type FeatureKey } from "@/lib/admin/entitlements";

/**
 * The ONE guard for Ambition Angels-only surfaces (pre-SafeSpace fence).
 *
 * Some admin pages and /api/admin routes read or write data that belongs to
 * AA alone and carries no tenant fence in the query: the public-site funnel
 * tables (quiz_submissions, partner_waitlist, program_partners, page_views,
 * click_events), the HubSpot mirror search RPC, and the global career-library
 * and teen-games tables (ms_*, game_*). "Signed in" is not enough there — a
 * member of ANY org would read AA's data or edit AA's public games.
 *
 * Rule: a session, membership in the ACTIVE org (getOrgContext resolves the
 * active org only among the user's own memberships), the active org holding
 * the surface's aa.* entitlement, and — for writes — the role permission
 * AA_WRITE_PERMISSION (owner/admin/staff; never finance or board_viewer).
 * It reuses the entitlement switchboard: no org id or slug in code.
 *
 *   const gate = await requireAaOnly("aa.career_library", { write: true });
 *   if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
 *
 * Pages use <AaOnlyGate> (app/admin/_components/AaOnlyGate.tsx), which calls
 * this same function. tests/tenant-isolation.test.ts fails CI when an AA-only
 * table is read from a file that is not behind this guard.
 */

export type AaOnlyKey = Extract<FeatureKey, `aa.${string}`>;

/** Writes to AA-only surfaces are program-content work. Checked as a
 *  permission (role_permissions), not a role name, so it stays data. */
export const AA_WRITE_PERMISSION = "program.write";

export type AaOnlyResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; status: 401 | 403; error: string };

export async function requireAaOnly(
  key: AaOnlyKey,
  opts: { write?: boolean } = {},
): Promise<AaOnlyResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (!hasFeature(await getEntitlements(ctx.orgId), key)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (opts.write && !(await ctxHasPermission(ctx, AA_WRITE_PERMISSION))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, ctx };
}
