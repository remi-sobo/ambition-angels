import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { loadBankStories, loadStoryPerms } from "@/lib/comms/stories-server";
import StoryBank from "./_components/StoryBank";

/**
 * Comms → Stories: the story bank (spec §7.2, Phase 2).
 *
 * Server-rendered through the same loader the API route uses, so the first
 * paint and any later refetch agree about what is publishable.
 *
 * comms.manage is checked here as well as by RLS. RLS alone would hand a
 * board viewer an empty list, which reads as "you have no stories" rather than
 * "this isn't yours" — a wrong answer, not just an unhelpful one.
 */
export const dynamic = "force-dynamic";

export default async function CommsStoriesPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Stories" subtitle="Sign in to view the story bank." />
      </div>
    );
  }

  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Stories" />
        <div className="rounded-card-lg border border-hairline bg-surface p-6 max-w-xl">
          <p className={TYPE.body}>
            You don&apos;t have access to Comms. Ask an owner or admin if you need it.
          </p>
        </div>
      </div>
    );
  }

  const stories = await loadBankStories(supabase, ctx.orgId, perms);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl">
      <PageHeader
        title="Stories"
        subtitle="The raw material for every newsletter, post, and donor update."
      />
      <StoryBank stories={stories} />
    </div>
  );
}
