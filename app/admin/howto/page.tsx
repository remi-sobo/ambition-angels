import Link from "next/link";
import PageHeader from "../_components/PageHeader";
import SectionHeading from "../_components/SectionHeading";
import { TYPE } from "@/lib/admin/typeScale";
import { getOrgContext } from "@/lib/admin/auth";
import { getEntitlements, type FeatureKey } from "@/lib/admin/entitlements";
import { getShellTermLabels } from "@/lib/admin/terminology";
import { resolveShellNav } from "@/lib/admin/v2shellNav";
import { navHelp } from "@/lib/admin/navIndex";
import { getRolePermissions } from "@/lib/admin/rolePermissions";

// A plain-language guide to BloomOS, served at Settings → Help (the route
// map 308s /admin/howto there). V4 A2: generated from the nav model, one
// section per destination this org can see and one entry per visible tab,
// with the current labels. The V1 guide (V1 section names and paths, AA-only
// programs shown to every tenant) is gone.
export const dynamic = "force-dynamic";

// Cross-cutting things that apply everywhere. Each idea that depends on a
// module or feature names its key, so an org without it never reads about it.
const GLOBALS: { title: string; body: string; feature?: FeatureKey }[] = [
  {
    title: "Finding your way",
    body: "The left sidebar has one row per area. Each area has one row of tabs across the top of its pages. Settings and Help sit at the bottom of the sidebar. Press / or Cmd-K anywhere to search for a page, a person or a record.",
  },
  {
    title: "Tasks connect everything",
    body: "Add a task on a donor, partner or project and it becomes a real task with an owner and a due date. It shows up in Tasks, on Today and in your week, with a link back to the record.",
    feature: "modules.ops",
  },
  {
    title: "Your calendar",
    body: "Connect Google Calendar under Settings and BloomOS shows your day on Today and My Week. BloomOS only reads your calendar.",
    feature: "modules.meetings",
  },
  {
    title: "Say it, then confirm it",
    body: "Capture turns a quick voice note into cards: a to-do, a donor conversation, a note. Nothing is saved until you confirm each card.",
    feature: "ai.capture",
  },
  {
    title: "Reed, used carefully",
    body: "Reed is the BloomOS assistant. It works only from your own records, drafts for your approval and never changes anything on its own.",
    feature: "ai.reed",
  },
  {
    title: "Audit trail",
    body: "Meaningful changes are recorded, so there is always a history of who changed what.",
  },
  {
    title: "Install as an app",
    body: "Add BloomOS to your home screen or dock for a full-screen, app-like experience on your phone or computer.",
  },
];

export default async function HowToPage() {
  // V4 A2: generated from the nav model for THIS org (lib/admin/navIndex.ts),
  // so the guide lists exactly what the sidebar shows, under the same labels.
  const ctx = await getOrgContext();
  const ents = ctx ? await getEntitlements(ctx.orgId) : null;
  const features = ents ? Array.from(ents) : [];
  const perms = ctx ? await getRolePermissions(ctx.role) : [];
  const sections = navHelp(resolveShellNav(features, await getShellTermLabels(), perms));
  const globals = GLOBALS.filter((g) => !g.feature || features.includes(g.feature));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
      <PageHeader
        title="How BloomOS works"
        subtitle="A plain-language guide to every section, module, and what it does."
      />

      {/* Table of contents */}
      <nav className="flex flex-wrap gap-2 mb-8">
        <a href="#start-here" className="text-xs font-semibold text-ink-2 hover:text-orange bg-tile border-hairline rounded-full px-3 py-1.5 transition-colors">
          Start here
        </a>
        {sections.map((s) => (
          <a
            key={s.key}
            href={`#${s.key}`}
            className="text-xs font-semibold text-ink-2 hover:text-orange bg-tile border-hairline rounded-full px-3 py-1.5 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Start here / global concepts */}
      <section id="start-here" className="scroll-mt-20 mb-10">
        <SectionHeading className="mb-1">Start here: the basics</SectionHeading>
        <p className="text-sm text-ink-2 mb-4 max-w-[70ch]">
          BloomOS is one operating system for the whole organization. A few ideas run through all
          of it:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {globals.map((g) => (
            <div key={g.title} className="bg-tile border-hairline rounded-panel-lg p-4">
              <h3 className={`${TYPE.cardTitle} mb-1`}>{g.title}</h3>
              <p className="text-sm text-ink-2 leading-relaxed">{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sections */}
      <div className="space-y-10">
        {sections.map((section) => (
          <section key={section.key} id={section.key} className="scroll-mt-20">
            <SectionHeading className="mb-1">{section.label}</SectionHeading>
            <p className="text-sm text-ink-2 mb-4">{section.blurb}</p>
            <div className="space-y-3">
              {section.tabs.map((tab) => (
                <article key={tab.key} className="bg-tile border-hairline rounded-panel-lg p-5">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-heading font-bold text-ink-1 text-base">{tab.label}</h3>
                    <Link
                      href={tab.href}
                      className="text-xs font-semibold text-orange hover:text-orange-dark transition-colors"
                    >
                      Open →
                    </Link>
                  </div>
                  {tab.what && <p className="text-sm text-ink-2 leading-relaxed max-w-[80ch]">{tab.what}</p>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-ink-3 mt-12 border-t border-hairline pt-5">
        BloomOS™ · the operating system for your nonprofit. This guide is built from your sidebar:
        if something is listed here, it is in the menu on the left.
      </p>
    </div>
  );
}
