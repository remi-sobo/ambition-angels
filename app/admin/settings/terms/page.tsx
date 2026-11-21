import type { Metadata } from "next";
import SettingsSectionPage from "../_components/SettingsSectionPage";
import { requirePagePermission } from "../../_components/PermissionGate";
import PageHeader from "../../_components/PageHeader";
import TermsForm from "./_components/TermsForm";
import { TERM_ROWS } from "@/lib/admin/termsEditor";
import { loadTerms } from "@/lib/admin/orgSettings-server";

// V4 Stage F: Settings → Terms, the org terminology editor (org_terminology,
// read by lib/admin/terminology.ts). Owner/admin only (org.manage).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms" };

export default async function Page() {
  const gate = await requirePagePermission("org.manage", "Terms");
  if (!gate.ok) return <SettingsSectionPage sectionKey="terms" />;
  const terms = await loadTerms(gate.ctx.orgId);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading space-y-6">
      <PageHeader title="Terms" subtitle="The words BloomOS uses for your people and groups." />
      <TermsForm rows={TERM_ROWS.map((r) => ({ ...r, value: terms[r.key] ?? "" }))} />
    </div>
  );
}
