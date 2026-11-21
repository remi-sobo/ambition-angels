import type { ReactNode } from "react";
import { requireAaOnly, type AaOnlyKey } from "@/lib/admin/aaOnly";
import { ModuleNotEnabled } from "@/app/admin/_components/FeatureGate";

/**
 * Page/layout form of the Ambition Angels-only guard (lib/admin/aaOnly.ts).
 * Wrap any route group whose server components read AA-only, tenant-less
 * data (career library, teen games, HubSpot mirror search, site funnel).
 * Fails closed to the standard not-authorized panel. Writes are gated in the
 * API routes, which call requireAaOnly with { write: true }.
 */
export default async function AaOnlyGate({
  feature,
  label,
  children,
}: {
  feature: AaOnlyKey;
  label: string;
  children: ReactNode;
}) {
  const gate = await requireAaOnly(feature);
  if (!gate.ok) return <ModuleNotEnabled label={label} />;
  return <>{children}</>;
}
