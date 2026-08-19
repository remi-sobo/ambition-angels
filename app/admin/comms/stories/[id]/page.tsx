import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { loadStory, loadStoryPerms } from "@/lib/comms/stories-server";
import StoryDetail from "../../_components/StoryDetail";

/**
 * One story, one altitude down (spec §7.2): the full body, the people it is
 * about, their consent, the photos, and the status control that turns a raw
 * capture into something the composer may use.
 */
export const dynamic = "force-dynamic";

export default async function StoryDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) notFound();

  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Story" />
        <div className="rounded-card-lg border border-hairline bg-surface p-6 max-w-xl">
          <p className={TYPE.body}>You don&apos;t have access to Comms.</p>
        </div>
      </div>
    );
  }

  const story = await loadStory(supabase, ctx.orgId, params.id, perms);
  if (!story) notFound();

  // Goals for the optional strategy link. Read through the session client, so
  // only this org's goals can ever be offered.
  const { data: goals } = await supabase
    .from("plan_goals")
    .select("id, title")
    .eq("org_id", ctx.orgId)
    .order("sort_order")
    .limit(200);

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl">
      <Link href="/admin/comms" className={`${TYPE.sectionHeader} hover:text-ink-1`}>
        ← Stories
      </Link>
      <div className="mt-2">
        <StoryDetail
          story={story}
          canSeeSubjects={perms.subjects}
          goals={(goals ?? []) as Array<{ id: string; title: string }>}
        />
      </div>
    </div>
  );
}
