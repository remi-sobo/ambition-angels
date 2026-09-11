import PageHeader from "../_components/PageHeader";
import { StatusChip } from "../_components/StatusChip";
import { getOrgHealth } from "@/lib/admin/orgHealth";
import { getOrgContext } from "@/lib/admin/auth";
import { TYPE } from "@/lib/admin/typeScale";
import type { Status } from "@/lib/admin/status";

/**
 * Spec Home, stage H2 — Organization Health: how the org is doing, and WHY.
 * Seven rows (fewer where entitlements drop rows — the 9-key orgs render 5),
 * each a house StatusChip plus a composed, deterministic cause sentence
 * (open decision 3, resolved). Every number comes from a canonical loader;
 * this screen computes nothing itself.
 *
 * Reachable by URL only until H3's cutover seats the tab.
 */
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<Status, string> = {
  healthy: "Healthy",
  due: "Due soon",
  watch: "Watch",
  critical: "Needs attention",
  neutral: "No signal",
};

export default async function OrganizationHealthPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <h1 className={TYPE.pageTitle}>Organization Health</h1>
        <p className="text-ink-2 mt-1">Sign in to see how the organization is doing.</p>
      </div>
    );
  }

  const rows = await getOrgHealth();
  if (!rows) return null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[820px]">
      <PageHeader
        title="Organization Health"
        subtitle="Each row says how it is, and why. Same input, same sentence."
      />

      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-2">No health rows are enabled for this organization.</p>
      ) : (
        <ul className="divide-y divide-outline/60 rounded-card border border-outline bg-white/50">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex w-full shrink-0 items-center justify-between sm:w-56 sm:justify-start sm:gap-3">
                <span className="font-heading font-semibold text-[13px] text-ink-1">{row.label}</span>
                <StatusChip status={row.status}>{STATUS_LABEL[row.status]}</StatusChip>
              </div>
              <p className="min-w-0 text-[13px] leading-relaxed text-ink-2">{row.cause}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
