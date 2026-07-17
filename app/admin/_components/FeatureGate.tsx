import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, hasFeature, type FeatureKey } from "@/lib/admin/entitlements";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * Server-side module gate (core fence B1). Wraps a module's route group from
 * its layout.tsx, so a direct URL hit on a disabled module renders the
 * not-authorized panel — sidebar hiding alone would be cosmetic.
 *
 * The entitlement read is request-cached (getEntitlements), so the shell and
 * every gate in one render share a single org_entitlements query. Fails
 * closed: no session context (shouldn't reach here — middleware bounces
 * unauthed /admin/* to /admin) renders the panel, same as the module being
 * off.
 */
export default async function FeatureGate({
  feature,
  label,
  children,
}: {
  /** One key, or several — any enabled key opens the gate (e.g. the import
   *  wizard serves both the program and fundraising modules). */
  feature: FeatureKey | FeatureKey[];
  /** Human module name shown on the panel, e.g. "Fundraising". */
  label: string;
  children: ReactNode;
}) {
  const ctx = await getOrgContext();
  const keys = Array.isArray(feature) ? feature : [feature];
  const ents = ctx ? await getEntitlements(ctx.orgId) : null;
  const enabled = !!ents && keys.some((k) => hasFeature(ents, k));
  if (!enabled) {
    return (
      <div className="px-4 lg:px-8 py-20 flex justify-center">
        <div className="max-w-md text-center">
          <div className="text-[10px] uppercase tracking-[0.25em] text-orange/80 mb-3">{label}</div>
          <h1 className={`${TYPE.sectionTitle} mb-2`}>
            This module isn&rsquo;t enabled
          </h1>
          <p className="text-sm text-ink-2 leading-relaxed">
            {label} isn&rsquo;t part of your organization&rsquo;s BloomOS setup. An owner can
            turn it on from the plan settings, or reach out to support.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
