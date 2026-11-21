import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements } from "@/lib/admin/entitlements";
import { visibleSettingsSections } from "@/lib/admin/settingsSections";
import SettingsNav from "./_components/SettingsNav";

// V4 Stage A2 — the Settings home frame: the left section list beside every
// settings page, including the setup screens the route map moved under
// /admin/settings. Sections are filtered by role (owner/admin for setup,
// finance also sees Finance) and by the org's modules.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getOrgContext();
  const ents = ctx ? await getEntitlements(ctx.orgId) : null;
  const sections = visibleSettingsSections(ctx?.role ?? null, ents ? Array.from(ents) : null);

  return (
    <div className="lg:flex lg:items-start">
      <SettingsNav sections={sections} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
