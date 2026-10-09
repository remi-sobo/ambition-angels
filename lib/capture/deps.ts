/**
 * Request-scoped dependencies for the C3 card actions: the session client,
 * the caller's handle for attribution, the audit writer bound to the request,
 * and the destination permission check. Routes build these once and hand them
 * to lib/capture/confirm.ts, which stays testable without Next.
 */

import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { ctxHasPermission, getAdminUser, type OrgContext } from "@/lib/admin/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ActionDeps } from "./confirm";

export async function actionDeps(req: NextRequest, ctx: OrgContext): Promise<ActionDeps> {
  const handle = (await getAdminUser()) ?? (ctx.email.split("@")[0] || "staff");
  return {
    supabase: createServerSupabase(),
    ctx: {
      orgId: ctx.orgId,
      userId: ctx.userId,
      handle,
      audit: (entry) => audit(req, entry),
    },
    hasPermission: (perm) => ctxHasPermission(ctx, perm),
  };
}
