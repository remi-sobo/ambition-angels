import Link from "next/link";
import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements } from "@/lib/admin/entitlements";
import { SETTINGS_SECTIONS, visibleSettingsSections } from "@/lib/admin/settingsSections";
import PageHeader from "../../_components/PageHeader";

/**
 * One Settings section page (V4 Stage A2): the section title and blurb, an
 * honest "coming in the next stage" line where no screen exists yet, and a
 * list of the setup screens that do exist, each one click away. Role and
 * module filtering come from lib/admin/settingsSections.ts, the same model
 * the left list uses, so the list and the page can never disagree.
 */
export default async function SettingsSectionPage({
  sectionKey,
  children,
}: {
  sectionKey: string;
  /** Extra read-only content under the links (e.g. Modules lists what is on). */
  children?: (features: readonly string[]) => ReactNode;
}) {
  const ctx = await getOrgContext();
  const ents = ctx ? await getEntitlements(ctx.orgId) : null;
  const features = ents ? Array.from(ents) : [];
  const declared = SETTINGS_SECTIONS.find((s) => s.key === sectionKey)!;
  const section = visibleSettingsSections(ctx?.role ?? null, ents ? features : null).find(
    (s) => s.key === sectionKey,
  );

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-reading">
      <PageHeader title={declared.label} subtitle={declared.blurb} />
      {!section ? (
        <p className="rounded-panel border border-hairline bg-surface px-5 py-4 text-sm text-ink-2">
          {declared.features && !declared.features.some((k) => features.includes(k))
            ? "This part of BloomOS is not turned on for your organization. Ask your BloomOS contact if you need it."
            : "Only an owner or admin can change these settings. Ask the owner of your organization if something here needs to change."}
        </p>
      ) : (
        <div className="space-y-4">
          {section.comingNext && (
            <p className="rounded-panel border border-hairline bg-tile px-5 py-4 text-sm text-ink-2 leading-relaxed">
              {section.comingNext}
            </p>
          )}
          {section.links.length > 0 && (
            <ul className="rounded-panel border border-hairline bg-surface divide-y divide-outline">
              {section.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="flex items-center justify-between gap-4 px-5 py-4 min-h-[44px] hover:bg-tile transition-colors first:rounded-t-panel last:rounded-b-panel"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-1">{l.label}</span>
                      <span className="block text-sm text-ink-2 mt-0.5">{l.blurb}</span>
                    </span>
                    <span aria-hidden className="shrink-0 text-ink-3">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {children?.(features)}
        </div>
      )}
    </div>
  );
}
