import type { Metadata } from "next";
import Link from "next/link";
import SettingsSectionPage from "../_components/SettingsSectionPage";
import { requirePagePermission } from "../../_components/PermissionGate";
import PageHeader from "../../_components/PageHeader";
import OrganizationForm from "./_components/OrganizationForm";
import { getEntitlements } from "@/lib/admin/entitlements";
import { visibleSettingsSections } from "@/lib/admin/settingsSections";
import { checklistDismissed, identityComplete, readOrgIdentity } from "@/lib/admin/orgIdentity";
import { ShowChecklistAgain } from "../../today/_components/SetupChecklistControls";
import { loadFiscalStartMonth, loadOrgRow } from "@/lib/admin/orgSettings-server";

// V4 Stage F: Settings → Organization (spec §11 "Organization identity").
// Owner/admin only (org.manage), checked here and again by the write route.
// The identity feeds thank-you and receipt sends (lib/email/org-identity.ts).
// Logo: not offered, because no public storage bucket exists for it yet.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organization" };

export default async function Page() {
  const gate = await requirePagePermission("org.manage", "Organization");
  if (!gate.ok) return <SettingsSectionPage sectionKey="organization" />;
  const ctx = gate.ctx;

  const [org, fiscalMonth, ents] = await Promise.all([loadOrgRow(ctx.orgId), loadFiscalStartMonth(ctx.orgId), getEntitlements(ctx.orgId)]);
  const id = readOrgIdentity({ name: org?.name ?? ctx.orgName, settings: org?.settings ?? null });
  const links = visibleSettingsSections(ctx.role, Array.from(ents)).find((s) => s.key === "organization")?.links ?? [];
  const complete = identityComplete(id);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading space-y-6">
      <PageHeader title="Organization" subtitle="Who you are as an organization, and the pages that speak for it." />

      {!complete ? (
        <p className="rounded-panel border border-hairline bg-tile px-5 py-4 text-sm text-ink-2 leading-relaxed">
          Donor receipts need your legal name, mailing address and EIN. Until all three are here, BloomOS will not send a tax receipt.
        </p>
      ) : null}

      <OrganizationForm
        initial={{
          name: id.name,
          legalName: id.legalName,
          ein: id.ein,
          address: id.address,
          timezone: id.timezone,
          fiscalMonth,
        }}
      />

      {checklistDismissed(org?.settings ?? null) ? (
        <div className="rounded-panel border border-hairline bg-surface px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">The setup list on Home is hidden.</p>
          <ShowChecklistAgain />
        </div>
      ) : null}

      {links.length > 0 ? (
        <ul className="rounded-panel border border-hairline bg-surface divide-y divide-outline">
          {links.map((l) => (
            <li key={l.href + l.label}>
              <Link href={l.href} className="flex items-center justify-between gap-4 px-5 py-4 min-h-[44px] hover:bg-tile transition-colors">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-1">{l.label}</span>
                  <span className="block text-sm text-ink-2 mt-0.5">{l.blurb}</span>
                </span>
                <span aria-hidden className="shrink-0 text-ink-3">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
