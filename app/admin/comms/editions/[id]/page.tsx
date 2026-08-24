import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "@/app/admin/_components/PageHeader";
import { TYPE } from "@/lib/admin/typeScale";
import { getMetricCatalog } from "@/lib/admin/metrics/catalog";
import { loadStoryPerms } from "@/lib/comms/stories-server";
import { loadEdition } from "@/lib/comms/editions-server";
import { loadEditionPerformance } from "@/lib/comms/loop-server";
import EditionBuilder, {
  type PickableStory,
} from "../../_components/EditionBuilder";

/**
 * One edition (spec §7.4).
 *
 * The story picker's options come from v_publishable_stories — the same
 * RLS-enforced view the slot-fill route checks against. A story whose consent
 * lapsed isn't offered here AND can't be accepted there; the picker is the
 * affordance, the route is the boundary.
 */
export const dynamic = "force-dynamic";

export default async function EditionPage({ params }: { params: { id: string } }) {
  const ctx = await getOrgContext();
  if (!ctx) notFound();

  const supabase = createServerSupabase();
  const perms = await loadStoryPerms(supabase, ctx.orgId);
  if (!perms.manage) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8">
        <PageHeader title="Edition" />
        <div className="rounded-card-lg border border-hairline bg-surface p-6 max-w-xl">
          <p className={TYPE.body}>You don&apos;t have access to Comms.</p>
        </div>
      </div>
    );
  }

  const detail = await loadEdition(supabase, ctx.orgId, params.id);
  if (!detail) notFound();

  // Sent editions get their after-the-fact numbers (spec §8 phase 6). Null for
  // anything unsent, and null again when fundraising RLS says no — the panel
  // simply says less.
  const performance =
    detail.edition.status === "sent"
      ? await loadEditionPerformance(supabase, ctx.orgId, detail.edition, detail.slots)
      : null;

  const [{ data: publishable }, catalog] = await Promise.all([
    supabase
      .from("v_publishable_stories")
      .select("id, title, body, outcome, rank_order, created_at")
      .eq("org_id", ctx.orgId)
      .order("rank_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200),
    getMetricCatalog(),
  ]);

  const stories = ((publishable ?? []) as unknown as PickableStory[]).map((s) => ({
    id: s.id,
    title: s.title,
    body: s.body,
    outcome: s.outcome,
  }));

  const metrics = catalog
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      latest: m.latest?.value ?? null,
      captured_on: m.latest?.captured_on ?? null,
      stale: m.stale,
    }));

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl">
      <Link href="/admin/comms/editions" className={`${TYPE.sectionHeader} hover:text-ink-1`}>
        ← Editions
      </Link>
      <div className="mt-2">
        <EditionBuilder
          detail={detail}
          stories={stories}
          metrics={metrics}
          performance={performance}
        />
      </div>
    </div>
  );
}
