import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { loadStoryPerms } from "@/lib/comms/stories-server";
import { loadEditions, loadFormats } from "@/lib/comms/editions-server";
import EditionsList from "../_components/EditionsList";

/**
 * Comms → Editions (spec §7.4).
 *
 * Formats seed on first visit here as well as on the Settings page, so an org
 * that lands on Editions first isn't told it has nothing to publish with.
 */
export const dynamic = "force-dynamic";

export default async function EditionsPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Editions" subtitle="Sign in to view editions." />
      </div>
    );
  }

  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Editions" />
        <div className="rounded-card-lg border border-hairline bg-surface p-6 max-w-xl">
          <p className={TYPE.body}>You don&apos;t have access to Comms.</p>
        </div>
      </div>
    );
  }

  const [formats, editions] = await Promise.all([
    loadFormats(supabase, ctx.orgId, { seed: true }),
    loadEditions(supabase, ctx.orgId),
  ]);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl">
      <PageHeader
        title="Editions"
        subtitle="Newsletters, updates, and appeals — planned ahead, filled from the bank."
      />
      <EditionsList editions={editions} formats={formats.filter((f) => !f.is_archived)} />
    </div>
  );
}
