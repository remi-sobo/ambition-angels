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
// "Send to a teammate" (handoff.ts) writes ONE team-inbox note through the
// notifications spine's single write path. This is the only door from
// Capture to anything beyond the session client (tests/capture-fence.test.ts).
import { notify } from "@/lib/notifications/notify";
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
    notify: async (n) => {
      // The pairing is the caller's active org and a recipient read from its
      // memberships through the session client (handoff.ts).
      if (n.orgId !== ctx.orgId) return null;
      const row = await notify(n);
      return row ? { id: row.id } : null;
    },
  };
}
