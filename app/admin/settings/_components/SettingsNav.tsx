"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionForPath, type SettingsSection } from "@/lib/admin/settingsSections";
import { TYPE } from "@/lib/admin/typeScale";

/**
 * V4 Stage A2 — the Settings home's left section list (spec §5: "left list
 * of sections, one section per page"). Desktop: a quiet vertical list beside
 * the section page. Phone: the same list as one row that scrolls sideways
 * inside its own box, so it never widens the screen.
 *
 * The active row follows the URL: a moved setup screen such as
 * /admin/settings/finance/rules highlights its section (Finance).
 */
export default function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const pathname = (usePathname() ?? "").split("?")[0];
  const active = sectionForPath(pathname, sections)?.key ?? null;

  return (
    <nav
      aria-label="Settings sections"
      className="px-4 pt-5 lg:pl-8 lg:pr-0 lg:pt-8 lg:w-[220px] lg:shrink-0 lg:sticky lg:top-0"
    >
      <div className="hidden lg:block text-xs font-medium uppercase tracking-[0.04em] text-ink-2 px-3 mb-2">
        Settings
      </div>
      <ul className="v2-tab-scroll flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible border-b border-hairline pb-2 lg:border-0 lg:pb-0">
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <li key={s.key} className="shrink-0">
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={[
                  "relative flex items-center min-h-[40px] px-3 rounded-control transition-colors whitespace-nowrap",
                  TYPE.nav,
                  on
                    ? "bg-surface text-ink-1 font-semibold border-hairline lg:before:content-[''] lg:before:absolute lg:before:left-0 lg:before:top-2 lg:before:bottom-2 lg:before:w-[3px] lg:before:rounded-r-full lg:before:bg-accent"
                    : "text-ink-2 hover:text-ink-1 hover:bg-tile",
                ].join(" ")}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
