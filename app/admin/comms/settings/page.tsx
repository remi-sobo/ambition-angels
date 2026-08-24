import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { loadStoryPerms } from "@/lib/comms/stories-server";
import { loadFormats } from "@/lib/comms/editions-server";
import FormatEditor from "../_components/FormatEditor";

/**
 * Comms → Settings: the format library (spec §7.4a).
 *
 * The four starters seed on first visit. They are a starting point, never a
 * constraint — every org renames slots into its own vocabulary, and the
 * Flourish coach tailors a format through this same editor rather than through
 * code.
 */
export const dynamic = "force-dynamic";

export default async function CommsSettingsPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Comms settings" subtitle="Sign in to view settings." />
      </div>
    );
  }

  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Comms settings" />
        <div className="rounded-card-lg border border-hairline bg-surface p-6 max-w-xl">
          <p className={TYPE.body}>You don&apos;t have access to Comms.</p>
        </div>
      </div>
    );
  }

  const formats = await loadFormats(supabase, ctx.orgId, { seed: true });
  const live = formats.filter((f) => !f.is_archived);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl">
      <PageHeader
        title="Comms settings"
        subtitle="Formats — the shape each of your publications takes."
      />
      <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
        Rename slots into your own words, reorder them, change what kind of thing each one holds.
        Edits apply to editions you create afterwards; anything already in progress keeps the
        layout it started with.
      </p>
      <FormatEditor formats={live} />
    </div>
  );
}
