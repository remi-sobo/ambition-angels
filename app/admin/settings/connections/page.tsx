import SettingsSectionPage from "../_components/SettingsSectionPage";

// V4 Stage A2: Settings → connections (sections declared in lib/admin/settingsSections.ts).
export const dynamic = "force-dynamic";

export default function Page() {
  return <SettingsSectionPage sectionKey="connections" />;
}
