import SettingsSectionPage from "../_components/SettingsSectionPage";
import { resolveShellNav } from "@/lib/admin/v2shellNav";

// V4 Stage A2: Settings → Modules. Turning modules on and off is the next
// stage; until then the page shows, read-only, what this org has on (the
// same nav model the sidebar is built from).
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SettingsSectionPage sectionKey="modules">
      {(features) => {
        const on = resolveShellNav([...features]).destinations;
        return (
          <section className="rounded-panel border border-hairline bg-surface px-5 py-4">
            <h2 className="text-sm font-semibold text-ink-1">On for your organization</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {on.map((d) => (
                <li key={d.key} className="text-sm text-ink-1 bg-tile border-hairline rounded-control px-3 py-1.5">
                  {d.label}
                </li>
              ))}
            </ul>
          </section>
        );
      }}
    </SettingsSectionPage>
  );
}
