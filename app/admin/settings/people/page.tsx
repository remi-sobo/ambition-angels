import SettingsSectionPage from "../_components/SettingsSectionPage";

// V4 Stage A2: Settings → people (sections declared in lib/admin/settingsSections.ts).
export const dynamic = "force-dynamic";

export default function Page() {
  return <SettingsSectionPage sectionKey="people" />;
}
