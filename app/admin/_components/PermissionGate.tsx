import type { ReactElement, ReactNode } from "react";
import type { OrgContext } from "@/lib/admin/auth";
import {
  requirePermission,
  type Permission,
  type RequirePermissionOptions,
} from "@/lib/admin/requirePermission";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Page form of the role guard (lib/admin/requirePermission.ts).
 *
 * Call it FIRST in a server-component page that reads through the
 * service-role client, before any query runs:
 *
 *   const gate = await requirePagePermission("finance.read", "Finance");
 *   if (!gate.ok) return gate.page;
 *   const ctx = gate.ctx;
 *
 * A layout-level check is not enough: on client navigation Next fetches only
 * the changed page segment, so the guard has to live in the page itself.
 */
export async function requirePagePermission(
  perm: Permission | readonly Permission[],
  label: string,
  opts: RequirePermissionOptions = {},
): Promise<{ ok: true; ctx: OrgContext } | { ok: false; page: ReactElement }> {
  const gate = await requirePermission(perm, opts);
  if (gate.ok) return gate;
  return { ok: false, page: <NotAuthorized label={label} /> };
}

/** Wrapper form for a server component tree whose children do the reads.
 *  The children only render (and so only query) when the gate opens. */
export default async function PermissionGate({
  perm,
  label,
  children,
}: {
  perm: Permission | readonly Permission[];
  label: string;
  children: ReactNode;
}) {
  const gate = await requirePermission(perm);
  if (!gate.ok) return <NotAuthorized label={label} />;
  return <>{children}</>;
}

/** The standard not-authorized panel for a role that lacks the permission. */
export function NotAuthorized({ label }: { label: string }) {
  return (
    <div className="px-4 lg:px-8 py-20 flex justify-center">
      <div className="max-w-md text-center">
        <div className="text-xs font-medium uppercase tracking-[0.04em] text-ink-2 mb-3">{label}</div>
        <h1 className={`${TYPE.sectionTitle} mb-2`}>You don&rsquo;t have access to this page</h1>
        <p className="text-sm text-ink-2 leading-relaxed">
          Your role in this organization doesn&rsquo;t include {label}. An owner or admin can
          change your role if you need it.
        </p>
      </div>
    </div>
  );
}
